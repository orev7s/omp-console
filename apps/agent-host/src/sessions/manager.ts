import { randomUUID } from "node:crypto";
import { copyFile, mkdir, open, rename } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type {
  AgentEvent,
  AgentState,
  AgentStatus,
  Capabilities,
  CreateSessionPayload,
  ModelInfo,
  NormalizedMessage,
  SessionInfo,
  SessionState,
} from "@omp-console/agent-protocol";
import type { AgentHostConfig } from "../config/index.js";
import type { Logger } from "../log/index.js";
import { RpcClient, type ReadyFrame } from "../rpc/index.js";
import { mapOmpFrame } from "../events/mapper.js";
import {
  asRecord,
  normalizedMessages,
  normalizedMessagesPage,
  normalizedModels,
  normalizedStats,
  splitModelRef,
} from "./normalize.js";
import { readSessionIndex, type PersistedSession } from "./record.js";
import { commandsFromFrame, readOmpVersion } from "../capabilities/index.js";
import { RestartPolicy } from "../supervisor/backoff.js";
import {
  buildSpawnCommand,
  resolveOmpBinary,
} from "../sandbox/index.js";
import type {
  ChildRecord,
  RuntimeState,
} from "../supervisor/runtime-state.js";

export class SessionManagerError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = "SessionManagerError";
  }
}

interface SessionRuntime extends PersistedSession {
  state: SessionState;
  client: RpcClient | null;
  sessionFile: string | null;
  lastError: string | null;
  policy: RestartPolicy;
  intentionalClose: boolean;
  starting: Promise<void> | null;
  restartTimer: NodeJS.Timeout | null;
  stableTimer: NodeJS.Timeout | null;
  unsubscribe: (() => void) | null;
}

export interface SessionManagerOptions {
  config: AgentHostConfig;
  logger: Logger;
  runtimeState: RuntimeState;
  onEvent: (event: AgentEvent) => void;
}

const STABILITY_WINDOW_MS = 30_000;

/**
 * Owns one `omp` child per session. Spawning is lazy: a session record exists
 * on disk, but no child runs until a prompt or an explicit start. A crash
 * restarts only that session, with backoff and a circuit breaker.
 */
export class SessionManager {
  private readonly sessions = new Map<string, SessionRuntime>();
  private readonly persisted: PersistedSession[] = [];
  private readonly sessionsIndexPath: string;
  private availableCommands: string[] = [];
  private lastReady: ReadyFrame | null = null;
  private ompVersion: string | null = null;
  private readonly startedAt = Date.now();
  private shuttingDown = false;

  constructor(private readonly options: SessionManagerOptions) {
    this.sessionsIndexPath = join(options.config.sessionsRoot, "index.json");
  }

  async init(): Promise<void> {
    const { config, logger } = this.options;
    await mkdir(config.sessionsRoot, { recursive: true, mode: 0o700 });
    const records = await readSessionIndex(this.sessionsIndexPath);
    for (const record of records) {
      this.persisted.push(record);
      this.sessions.set(record.id, this.runtimeFrom(record, "stopped"));
    }
    this.ompVersion = await readOmpVersion(config.ompBin);
    logger.info("session manager ready", {
      sessions: this.sessions.size,
      ompVersion: this.ompVersion,
      confinement: config.confinement,
    });
  }

  async create(payload: CreateSessionPayload): Promise<SessionInfo> {
    if (this.shuttingDown) {
      throw new SessionManagerError("agent host is shutting down", "shutting_down");
    }
    const { config } = this.options;
    const id = randomUUID();
    const cwd = payload.cwd ?? config.ompCwd ?? config.workspaceRoot;
    await mkdir(cwd, { recursive: true, mode: 0o700 });
    const homeDir = join(config.sessionsRoot, id, "home");
    const sessionDir = join(homeDir, "sessions");
    await mkdir(sessionDir, { recursive: true, mode: 0o700 });
    await mkdir(join(homeDir, ".omp", "agent"), {
      recursive: true,
      mode: 0o700,
    });
    if (config.confinement === "restricted") {
      await this.seedRestrictedHome(homeDir);
    }

    const record: PersistedSession = {
      id,
      cwd,
      model: payload.model ?? config.ompModel,
      thinkingLevel: payload.thinkingLevel ?? null,
      homeDir,
      sessionDir,
      createdAt: new Date().toISOString(),
      title: null,
    };
    this.persisted.push(record);
    const session = this.runtimeFrom(record, "starting");
    this.sessions.set(id, session);
    await this.persist();
    await this.startSession(session);
    return this.info(session);
  }

  async prompt(sessionId: string, message: string): Promise<void> {
    const session = this.require(sessionId);
    await this.ensureStarted(session);
    const client = this.requireClient(session);
    const response = await client.prompt(message);
    if (!response.success) {
      throw new SessionManagerError(
        `omp rejected the prompt: ${String(response.error ?? "unknown")}`,
        "prompt_rejected",
      );
    }
    this.setState(session, "busy");
  }

  async abort(sessionId: string): Promise<void> {
    const session = this.require(sessionId);
    const client = this.requireClient(session);
    const response = await client.abort();
    if (!response.success) {
      throw new SessionManagerError(
        `omp rejected the abort: ${String(response.error ?? "unknown")}`,
        "abort_rejected",
      );
    }
  }

  /**
   * Best-effort transcript backfill from the running `omp` child. Returns an
   * empty list when the session is not running or `omp` answers unexpectedly;
   * the control plane treats this as optional history, never a failure.
   */
  async messages(sessionId: string): Promise<NormalizedMessage[]> {
    const session = this.sessions.get(sessionId);
    if (session === undefined) return [];
    const client = session.client;
    if (client === null || client.isClosed) return [];
    try {
      const response = await client.sendCommand(
        "get_messages",
        {},
        { timeoutMs: 15_000 },
      );
      if (!response.success) return [];
      return normalizedMessages(response.data);
    } catch {
      return [];
    }
  }

  /**
   * List the models the running `omp` can switch to. Best effort: an absent
   * child or an unexpected answer yields an empty list, never an error.
   */
  async availableModels(sessionId: string): Promise<ModelInfo[]> {
    const client = this.readClient(sessionId);
    if (client === null) return [];
    try {
      const response = await client.sendCommand(
        "get_available_models",
        {},
        { timeoutMs: 15_000 },
      );
      if (!response.success) return [];
      return normalizedModels(response.data);
    } catch {
      return [];
    }
  }

  /**
   * Switch the session's model. L2 carries one string while omp wants a
   * provider and a model id apart, so a `provider/modelId` value splits on the
   * first slash. On success the runtime is updated and the state re-emitted.
   */
  async setModel(sessionId: string, model: string): Promise<void> {
    const session = this.require(sessionId);
    const client = this.requireClient(session);
    const { provider, modelId } = splitModelRef(model);
    const response = await client.sendCommand(
      "set_model",
      { provider, modelId },
      { timeoutMs: 30_000 },
    );
    if (!response.success) {
      throw new SessionManagerError(
        `omp rejected the model change: ${String(response.error ?? "unknown")}`,
        "set_model_rejected",
      );
    }
    session.model = model;
    this.updatePersisted(session.id, (record) => {
      record.model = model;
    });
    this.emitState(session);
  }

  /**
   * Set the reasoning level for the session. Same contract as `setModel`:
   * omp failures throw, success updates the runtime and re-emits the state.
   */
  async setThinking(sessionId: string, level: string): Promise<void> {
    const session = this.require(sessionId);
    const client = this.requireClient(session);
    const response = await client.sendCommand(
      "set_thinking_level",
      { level },
      { timeoutMs: 15_000 },
    );
    if (!response.success) {
      throw new SessionManagerError(
        `omp rejected the thinking level change: ${String(response.error ?? "unknown")}`,
        "set_thinking_rejected",
      );
    }
    session.thinkingLevel = level;
    this.updatePersisted(session.id, (record) => {
      record.thinkingLevel = level;
    });
    this.emitState(session);
  }

  /** Current session statistics from `omp`; `{}` when unavailable. */
  async stats(sessionId: string): Promise<Record<string, unknown>> {
    const client = this.readClient(sessionId);
    if (client === null) return {};
    try {
      const response = await client.sendCommand(
        "get_session_stats",
        {},
        { timeoutMs: 15_000 },
      );
      if (!response.success) return {};
      return normalizedStats(response.data);
    } catch {
      return {};
    }
  }

  /** Inject a steer message into the running turn. */
  async steer(sessionId: string, message: string): Promise<void> {
    const session = this.require(sessionId);
    const client = this.requireClient(session);
    const response = await client.sendCommand(
      "steer",
      { message },
      { timeoutMs: 15_000 },
    );
    if (!response.success) {
      throw new SessionManagerError(
        `omp rejected the steer: ${String(response.error ?? "unknown")}`,
        "steer_rejected",
      );
    }
  }

  /** Queue a follow-up message to run after the current turn. */
  async followUp(sessionId: string, message: string): Promise<void> {
    const session = this.require(sessionId);
    const client = this.requireClient(session);
    const response = await client.sendCommand(
      "follow_up",
      { message },
      { timeoutMs: 15_000 },
    );
    if (!response.success) {
      throw new SessionManagerError(
        `omp rejected the follow-up: ${String(response.error ?? "unknown")}`,
        "follow_up_rejected",
      );
    }
  }

  /**
   * One page of the transcript. Best effort like `messages`: an absent child
   * or an unexpected answer yields an empty page, never an error.
   */
  async messagesPage(
    sessionId: string,
    cursor?: string,
    limit?: number,
  ): Promise<{ messages: NormalizedMessage[]; nextCursor: string | null }> {
    const client = this.readClient(sessionId);
    if (client === null) return { messages: [], nextCursor: null };
    const payload: Record<string, unknown> = {};
    if (cursor !== undefined) payload["cursor"] = cursor;
    if (limit !== undefined) payload["limit"] = limit;
    try {
      const response = await client.sendCommand(
        "get_messages_page",
        payload,
        { timeoutMs: 15_000 },
      );
      if (!response.success) return { messages: [], nextCursor: null };
      return normalizedMessagesPage(response.data);
    } catch {
      return { messages: [], nextCursor: null };
    }
  }

  async closeSession(sessionId: string): Promise<void> {
    const session = this.require(sessionId);
    session.intentionalClose = true;
    this.clearTimers(session);
    session.unsubscribe?.();
    session.unsubscribe = null;
    const client = session.client;
    session.client = null;
    if (client !== null) {
      const pid = client.pid;
      await client.close();
      if (pid !== null) killProcessGroup(pid);
    }
    this.setState(session, "stopped");
    await this.saveChildren();
    await this.persist();
  }

  list(): SessionInfo[] {
    return [...this.sessions.values()].map((session) => this.info(session));
  }

  get(sessionId: string): SessionInfo {
    return this.info(this.require(sessionId));
  }

  status(): AgentStatus {
    return {
      state: aggregateState([...this.sessions.values()].map((s) => s.state)),
      pid: process.pid,
      uptimeMs: Date.now() - this.startedAt,
      sessions: this.list(),
    };
  }

  async capabilities(): Promise<Capabilities> {
    let loginProviders: unknown = null;
    const client = [...this.sessions.values()]
      .map((session) => session.client)
      .find(
        (candidate): candidate is RpcClient =>
          candidate !== null && !candidate.isClosed,
      );
    if (client !== undefined) {
      try {
        const response = await client.sendCommand(
          "get_login_providers",
          {},
          { timeoutMs: 10_000 },
        );
        if (response.success) loginProviders = response.data ?? null;
      } catch {
        loginProviders = null;
      }
    }
    return {
      ompVersion: this.ompVersion,
      protocolVersion: this.lastReady?.protocolVersion ?? 1,
      supportedProtocolVersions:
        this.lastReady?.supportedProtocolVersions ?? [1],
      commands: [...this.availableCommands],
      loginProviders,
    };
  }

  async shutdown(): Promise<void> {
    this.shuttingDown = true;
    await Promise.allSettled(
      [...this.sessions.keys()].map((id) => this.closeSession(id)),
    );
  }

  private runtimeFrom(
    record: PersistedSession,
    state: SessionState,
  ): SessionRuntime {
    const { config } = this.options;
    return {
      ...record,
      state,
      client: null,
      sessionFile: null,
      lastError: null,
      policy: new RestartPolicy({
        baseMs: config.restartBaseMs,
        maxMs: config.restartMaxMs,
        maxAttempts: config.maxRestarts,
      }),
      intentionalClose: false,
      starting: null,
      restartTimer: null,
      stableTimer: null,
      unsubscribe: null,
    };
  }

  private async startSession(session: SessionRuntime): Promise<void> {
    if (session.starting !== null) {
      await session.starting;
      return;
    }
    if (session.client !== null && !session.client.isClosed) return;

    session.starting = this.spawn(session).finally(() => {
      session.starting = null;
    });
    await session.starting;
  }

  private async spawn(session: SessionRuntime): Promise<void> {
    const { config, logger } = this.options;
    this.setState(session, "starting");

    const args = [
      ...config.ompArgs,
      "--session-dir",
      session.sessionDir,
    ];
    if (session.model !== null) args.push("--model", session.model);
    if (session.thinkingLevel !== null) {
      args.push("--thinking", session.thinkingLevel);
    }

    const command = buildSpawnCommand({
      mode: config.confinement,
      ompBin: resolveOmpBinary(config.ompBin),
      ompArgs: args,
      workspace: session.cwd,
      homeDir: session.homeDir,
    });

    const client = new RpcClient({
      binPath: command.bin,
      args: command.args,
      cwd: session.cwd,
      env:
        config.confinement === "restricted"
          ? { HOME: session.homeDir }
          : undefined,
      commandTimeoutMs: config.commandTimeoutMs,
      readyTimeoutMs: config.readyTimeoutMs,
      shutdownGraceMs: config.shutdownGraceMs,
      detached: true,
      logger: logger.child({ sessionId: session.id }),
    });

    session.intentionalClose = false;
    session.client = client;
    session.unsubscribe = client.onEvent((frame) =>
      this.handleFrame(session, frame),
    );
    client.onExit((info) => this.handleExit(session, info));

    try {
      const ready = await client.start();
      this.lastReady = ready;
      const opened = await client.sendCommand("open_session", {
        sessionDir: session.sessionDir,
      });
      if (opened.success) {
        const data = asRecord(opened.data);
        const file = data?.["sessionFile"];
        session.sessionFile = typeof file === "string" ? file : null;
      }
      session.lastError = null;
      this.setState(session, "ready");
      await this.saveChildren();
      this.clearTimers(session);
      session.stableTimer = setTimeout(() => {
        session.policy.reset();
      }, STABILITY_WINDOW_MS);
      session.stableTimer.unref();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      session.lastError = message;
      logger.error("failed to start omp", {
        sessionId: session.id,
        error: message,
        stderr: client.stderr.slice(-1_500),
        command: [command.bin, ...command.args].join(" "),
      });
      await client.close();
      this.setState(session, "crashed");
      this.scheduleRestart(session);
      throw error;
    }
  }

  private handleFrame(session: SessionRuntime, frame: Record<string, unknown> & { type: string }): void {
    const commands = commandsFromFrame(frame);
    if (commands !== null) this.availableCommands = commands;

    if (frame.type === "agent_start") this.setState(session, "busy");
    if (frame.type === "agent_end" && frame["isTerminal"] !== false) {
      this.setState(session, "ready");
    }
    if (frame.type === "session_settled") this.setState(session, "ready");

    const event = mapOmpFrame(frame);
    if (event !== null) {
      this.options.onEvent({
        type: "session.event",
        sessionId: session.id,
        event,
      });
      if (event.kind === "message.end" && event.message.role === "user") {
        this.maybeSetTitle(session, event.message.text);
      }
    }
  }

  /**
   * Name a session from its first user message. Runs once per session: later
   * user messages never rename it. The title is truncated to a single line so
   * the session list stays readable.
   */
  private maybeSetTitle(session: SessionRuntime, text: string): void {
    if (session.title !== null) return;
    const title = deriveTitle(text);
    if (title.length === 0) return;
    session.title = title;
    const record = this.persisted.find((entry) => entry.id === session.id);
    if (record !== undefined) record.title = title;
    this.options.onEvent({ type: "session.state", session: this.info(session) });
    void this.persist().catch(() => {
      // A failed title write must not affect the live session.
    });
  }

  private handleExit(
    session: SessionRuntime,
    info: { code: number | null; signal: NodeJS.Signals | null },
  ): void {
    const tail = session.client?.stderr ?? "";
    session.unsubscribe?.();
    session.unsubscribe = null;
    session.client = null;
    session.stableTimer = null;
    this.clearTimers(session);
    void this.saveChildren();

    if (session.intentionalClose || this.shuttingDown) {
      this.setState(session, "stopped");
      return;
    }

    this.options.logger.warn("omp exited unexpectedly", {
      sessionId: session.id,
      code: info.code,
      signal: info.signal,
      stderr: tail.slice(-500),
    });
    session.lastError = tail.trim() || `omp exited (code ${info.code})`;
    this.setState(session, "crashed");
    this.scheduleRestart(session);
  }

  private scheduleRestart(session: SessionRuntime): void {
    if (this.shuttingDown) return;
    const delay = session.policy.nextDelay();
    if (delay === null) {
      this.options.logger.error("restart circuit opened", {
        sessionId: session.id,
      });
      this.setState(session, "failed");
      return;
    }
    session.restartTimer = setTimeout(() => {
      session.restartTimer = null;
      void this.startSession(session).catch(() => {
        // spawn() already logged and scheduled the next attempt.
      });
    }, delay);
    session.restartTimer.unref();
  }

  private async ensureStarted(session: SessionRuntime): Promise<void> {
    if (session.state === "failed") {
      throw new SessionManagerError(
        "session failed after repeated crashes; close it and start a new one",
        "session_failed",
      );
    }
    if (session.client !== null && !session.client.isClosed) return;
    this.clearTimers(session);
    await this.startSession(session);
  }

  private require(sessionId: string): SessionRuntime {
    const session = this.sessions.get(sessionId);
    if (session === undefined) {
      throw new SessionManagerError(
        `unknown session: ${sessionId}`,
        "session_not_found",
      );
    }
    return session;
  }

  private requireClient(session: SessionRuntime): RpcClient {
    if (session.client === null) {
      throw new SessionManagerError(
        `session is not running: ${session.id}`,
        "session_not_running",
      );
    }
    return session.client;
  }

  /** The live RPC client for a session, or null when it is absent or closed. */
  private readClient(sessionId: string): RpcClient | null {
    const session = this.sessions.get(sessionId);
    if (session === undefined) return null;
    const client = session.client;
    if (client === null || client.isClosed) return null;
    return client;
  }

  /** Mutate the on-disk record for a session, if it still exists. */
  private updatePersisted(
    sessionId: string,
    mutate: (record: PersistedSession) => void,
  ): void {
    const record = this.persisted.find((entry) => entry.id === sessionId);
    if (record !== undefined) mutate(record);
  }

  /** Re-emit a session's state after a runtime change, persisting best effort. */
  private emitState(session: SessionRuntime): void {
    this.options.onEvent({ type: "session.state", session: this.info(session) });
    void this.persist().catch(() => {
      // A failed write must not fail the live action.
    });
  }

  private info(session: SessionRuntime): SessionInfo {
    return {
      id: session.id,
      title: session.title,
      cwd: session.cwd,
      model: session.model,
      thinkingLevel: session.thinkingLevel,
      state: session.state,
      sessionFile: session.sessionFile,
      createdAt: session.createdAt,
      lastError: session.lastError,
    };
  }

  private setState(session: SessionRuntime, state: SessionState): void {
    if (session.state === state) return;
    session.state = state;
    this.options.onEvent({ type: "session.state", session: this.info(session) });
    this.options.onEvent({ type: "agent.state", status: this.status() });
  }

  private clearTimers(session: SessionRuntime): void {
    if (session.restartTimer !== null) {
      clearTimeout(session.restartTimer);
      session.restartTimer = null;
    }
    if (session.stableTimer !== null) {
      clearTimeout(session.stableTimer);
      session.stableTimer = null;
    }
  }

  private async seedRestrictedHome(homeDir: string): Promise<void> {
    const agentDir = join(homeDir, ".omp", "agent");
    for (const name of ["models.yml", ".env"]) {
      try {
        await copyFile(join(homedir(), ".omp", "agent", name), join(agentDir, name));
      } catch {
        // A missing provider config is allowed; the agent will report it.
      }
    }
  }

  private async recordChildren(): Promise<ChildRecord[]> {
    const records: ChildRecord[] = [];
    for (const session of this.sessions.values()) {
      const pid = session.client?.pid;
      if (pid === undefined || pid === null) continue;
      records.push({
        sessionId: session.id,
        pid,
        pgid: pid,
        sessionDir: session.sessionDir,
      });
    }
    return records;
  }

  private async saveChildren(): Promise<void> {
    await this.options.runtimeState.save(await this.recordChildren());
  }

  private async persist(): Promise<void> {
    await mkdir(dirname(this.sessionsIndexPath), {
      recursive: true,
      mode: 0o700,
    });
    const temp = `${this.sessionsIndexPath}.${process.pid}.${Date.now()}.${Math.random()
      .toString(36)
      .slice(2)}.tmp`;
    const handle = await open(temp, "w", 0o600);
    try {
      await handle.writeFile(
        JSON.stringify({ version: 1, sessions: this.persisted }, null, 2),
        "utf8",
      );
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temp, this.sessionsIndexPath);
  }

}

/** Collapse a message to one line, capped for the session list. */
function deriveTitle(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, 80);
}

function aggregateState(states: SessionState[]): AgentState {
  if (states.some((state) => state === "busy")) return "busy";
  if (states.some((state) => state === "ready")) return "ready";
  if (states.some((state) => state === "starting")) return "starting";
  if (states.some((state) => state === "failed")) return "failed";
  if (states.some((state) => state === "crashed")) return "crashed";
  if (states.some((state) => state === "stopped")) return "stopped";
  return "stopped";
}

function killProcessGroup(pid: number): void {
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // Already gone.
    }
  }
}