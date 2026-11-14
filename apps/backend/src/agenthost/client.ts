import { randomUUID } from "node:crypto";
import { connect, type Socket } from "node:net";
import {
  AGENT_PROTOCOL_VERSION,
  AgentEventMessageSchema,
  AgentResponseSchema,
  AgentStatusSchema,
  CapabilitiesSchema,
  FollowUpPayloadSchema,
  MessagesPagePayloadSchema,
  SessionInfoSchema,
  SessionMessagesPageResponseSchema,
  SessionMessagesResponseSchema,
  SessionModelsResponseSchema,
  SessionStatsResponseSchema,
  SetModelPayloadSchema,
  SetThinkingPayloadSchema,
  SteerPayloadSchema,
  type AgentEvent,
  type AgentStatus,
  type Capabilities,
  type CreateSessionPayload,
  type ModelInfo,
  type NormalizedMessage,
  type SessionInfo,
  type SessionMessagesPageResponse,
} from "@omp-console/agent-protocol";
import type { Logger } from "../log/index.js";

export interface AgentHostClientOptions {
  socketPath: string;
  logger: Logger;
  reconnectBaseMs?: number;
  reconnectMaxMs?: number;
  requestTimeoutMs?: number;
}

interface Pending {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

const DEFAULT_RECONNECT_BASE_MS = 1_000;
const DEFAULT_RECONNECT_MAX_MS = 30_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;

/**
 * The control plane's only path to the agent host. It never spawns `omp` and
 * never sees OMP frames. If the socket is absent it keeps retrying and reports
 * `unavailable`, so auth, health, and monitoring keep working.
 */
export class AgentHostClient {
  private socket: Socket | null = null;
  private buffer = "";
  private connected = false;
  private closed = false;
  private attempt = 0;
  private status: AgentStatus | null = null;
  private capabilities: Capabilities | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private readonly pending = new Map<string, Pending>();
  private readonly listeners = new Set<(event: AgentEvent) => void>();
  private readonly connectListeners = new Set<() => void>();
  private readonly subscribed = new Set<string>();
  private readonly reconnectBaseMs: number;
  private readonly reconnectMaxMs: number;
  private readonly requestTimeoutMs: number;

  constructor(private readonly options: AgentHostClientOptions) {
    this.reconnectBaseMs =
      options.reconnectBaseMs ?? DEFAULT_RECONNECT_BASE_MS;
    this.reconnectMaxMs = options.reconnectMaxMs ?? DEFAULT_RECONNECT_MAX_MS;
    this.requestTimeoutMs =
      options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  }

  start(): void {
    this.closed = false;
    this.connectOnce();
  }

  close(): void {
    this.closed = true;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.socket?.destroy();
    this.socket = null;
    this.connected = false;
    this.rejectAll(new Error("agent host client closed"));
  }

  get isConnected(): boolean {
    return this.connected;
  }

  get agentStatus(): AgentStatus | null {
    return this.status;
  }

  get ompVersion(): string | null {
    return this.capabilities?.ompVersion ?? null;
  }

  get capabilitiesInfo(): Capabilities | null {
    return this.capabilities;
  }

  onEvent(listener: (event: AgentEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Fires after each successful (re)connect, once the status refresh has
   * settled. The control plane uses it to re-subscribe to live sessions, which
   * the agent host forgets per socket after a reconnect.
   */
  onConnect(listener: () => void): () => void {
    this.connectListeners.add(listener);
    return () => {
      this.connectListeners.delete(listener);
    };
  }

  /** Session ids this client has asked the agent host to stream. */
  subscriptions(): string[] {
    return [...this.subscribed];
  }

  async createSession(payload: CreateSessionPayload): Promise<SessionInfo> {
    return SessionInfoSchema.parse(await this.request("session.create", payload));
  }

  async listSessions(): Promise<SessionInfo[]> {
    return SessionInfoSchema.array().parse(await this.request("session.list"));
  }

  async getSession(sessionId: string): Promise<SessionInfo> {
    return SessionInfoSchema.parse(
      await this.request("session.get", { sessionId }),
    );
  }

  async promptSession(sessionId: string, message: string): Promise<void> {
    await this.request("session.prompt", { sessionId, message });
  }

  async abortSession(sessionId: string): Promise<void> {
    await this.request("session.abort", { sessionId });
  }

  async sessionMessages(sessionId: string): Promise<NormalizedMessage[]> {
    const response = SessionMessagesResponseSchema.parse(
      await this.request("session.messages", { sessionId }),
    );
    return response.messages;
  }

  /** Models the session can switch to. */
  async availableModels(sessionId: string): Promise<ModelInfo[]> {
    const response = SessionModelsResponseSchema.parse(
      await this.request("session.availableModels", { sessionId }),
    );
    return response.models;
  }

  async setModel(sessionId: string, model: string): Promise<void> {
    const payload = SetModelPayloadSchema.parse({ sessionId, model });
    await this.request("session.setModel", payload);
  }

  async setThinking(sessionId: string, level: string): Promise<void> {
    const payload = SetThinkingPayloadSchema.parse({
      sessionId,
      thinkingLevel: level,
    });
    await this.request("session.setThinking", payload);
  }

  async stats(sessionId: string): Promise<Record<string, unknown>> {
    const response = SessionStatsResponseSchema.parse(
      await this.request("session.stats", { sessionId }),
    );
    return response.stats;
  }

  async steer(sessionId: string, message: string): Promise<void> {
    const payload = SteerPayloadSchema.parse({ sessionId, message });
    await this.request("session.steer", payload);
  }

  async followUp(sessionId: string, message: string): Promise<void> {
    const payload = FollowUpPayloadSchema.parse({ sessionId, message });
    await this.request("session.followUp", payload);
  }

  /** A page of the session transcript, oldest first, for cursor paging. */
  async messagesPage(
    sessionId: string,
    cursor?: string,
    limit?: number,
  ): Promise<SessionMessagesPageResponse> {
    const payload = MessagesPagePayloadSchema.parse({
      sessionId,
      ...(cursor !== undefined ? { cursor } : {}),
      ...(limit !== undefined ? { limit } : {}),
    });
    return SessionMessagesPageResponseSchema.parse(
      await this.request("session.messagesPage", payload),
    );
  }

  async subscribeSessions(sessionIds: string[]): Promise<void> {
    if (sessionIds.length === 0) return;
    await this.request("session.subscribe", { sessionIds });
    for (const id of sessionIds) this.subscribed.add(id);
  }

  async refresh(): Promise<void> {
    try {
      const status = await this.request("agent.status");
      this.status = AgentStatusSchema.parse(status);
    } catch {
      this.status = null;
    }
    try {
      const capabilities = await this.request("agent.capabilities");
      this.capabilities = CapabilitiesSchema.parse(capabilities);
    } catch {
      this.capabilities = null;
    }
  }

  async request(type: string, payload?: unknown): Promise<unknown> {
    const socket = this.socket;
    if (socket === null || !this.connected) {
      throw new Error("agent host is not connected");
    }
    const id = randomUUID();
    const line =
      JSON.stringify({
        v: AGENT_PROTOCOL_VERSION,
        id,
        type,
        ...(payload === undefined ? {} : { payload }),
      }) + "\n";

    return await new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`timed out waiting for ${type}`));
      }, this.requestTimeoutMs);
      timer.unref();
      this.pending.set(id, { resolve, reject, timer });
      try {
        socket.write(line);
      } catch (error) {
        this.pending.delete(id);
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  private connectOnce(): void {
    if (this.closed) return;
    const socket = connect(this.options.socketPath);
    this.socket = socket;
    socket.setEncoding("utf8");
    socket.setNoDelay(true);

    socket.on("connect", () => {
      this.connected = true;
      this.attempt = 0;
      this.options.logger.info("connected to agent host", {
        socketPath: this.options.socketPath,
      });
      void this.refresh().finally(() => {
        if (!this.closed && this.connected) this.notifyConnect();
      });
    });

    socket.on("data", (chunk: string) => this.onData(chunk));

    socket.on("error", (error) => {
      // ENOENT while the agent host is down is expected, not an incident.
      this.options.logger.debug("agent host socket error", {
        error: error.message,
      });
    });

    socket.on("close", () => {
      const wasConnected = this.connected;
      this.connected = false;
      this.socket = null;
      this.status = null;
      this.capabilities = null;
      this.rejectAll(new Error("agent host connection closed"));
      if (wasConnected) {
        this.options.logger.warn("agent host disconnected");
      }
      this.scheduleReconnect();
    });
  }

  private scheduleReconnect(): void {
    if (this.closed || this.reconnectTimer !== null) return;
    const delay = Math.min(
      this.reconnectMaxMs,
      this.reconnectBaseMs * 2 ** this.attempt,
    );
    this.attempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connectOnce();
    }, delay);
    this.reconnectTimer.unref();
  }

  private onData(chunk: string): void {
    this.buffer += chunk;
    let index = this.buffer.indexOf("\n");
    while (index !== -1) {
      const line = this.buffer.slice(0, index);
      this.buffer = this.buffer.slice(index + 1);
      if (line.trim().length > 0) this.handleLine(line);
      index = this.buffer.indexOf("\n");
    }
  }

  private handleLine(line: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      this.options.logger.debug("agent host sent invalid JSON");
      return;
    }

    const response = AgentResponseSchema.safeParse(parsed);
    if (response.success) {
      const pending = this.pending.get(response.data.id);
      if (pending !== undefined) {
        this.pending.delete(response.data.id);
        clearTimeout(pending.timer);
        if (response.data.ok) pending.resolve(response.data.data);
        else {
          pending.reject(
            new Error(
              response.data.error?.message ?? "agent host request failed",
            ),
          );
        }
      }
      return;
    }

    const event = AgentEventMessageSchema.safeParse(parsed);
    if (!event.success) return;
    const value = event.data.event;
    if (value.type === "agent.state") this.status = value.status;
    for (const listener of this.listeners) {
      try {
        listener(value);
      } catch (error) {
        this.options.logger.warn("agent event listener threw", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  private notifyConnect(): void {
    for (const listener of this.connectListeners) {
      try {
        listener();
      } catch (error) {
        this.options.logger.warn("agent connect listener threw", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  private rejectAll(error: Error): void {
    for (const [id, pending] of this.pending) {
      this.pending.delete(id);
      clearTimeout(pending.timer);
      pending.reject(error);
    }
  }
}