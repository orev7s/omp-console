import { basename } from "node:path";
import type { Message, MessageTool, Session } from "@omp-console/protocol";
import type {
  AgentStatus as L2AgentStatus,
  NormalizedMessage,
  SessionEvent as L2SessionEvent,
  SessionInfo as L2SessionInfo,
} from "@omp-console/agent-protocol";
import { nowIso } from "../util/time.js";
import { randomId } from "../util/id.js";

interface MessageBuild {
  role: string;
  text: string;
  thinking: string;
  tools: MessageTool[];
}

interface TranscriptEntry {
  messages: Message[];
  /** Message id to its position in `messages`, for in-place updates. */
  index: Map<string, number>;
  /** In-progress messages keyed by the runtime's message id. */
  builds: Map<string, MessageBuild>;
  current: string | null;
}

interface SessionRecord {
  session: Session;
  createName: string | null;
}

/**
 * In-memory view of agent sessions and their transcripts, as the app sees them.
 * It is fed only by L2 events and the create response, so it never imports OMP
 * types and never touches a process. The agent host stays the source of truth;
 * this is a reconstructable cache, not durable state.
 */
export class SessionRegistry {
  private readonly records = new Map<string, SessionRecord>();
  private readonly transcripts = new Map<string, TranscriptEntry>();
  /** Pending prompt count per session, reported by the agent host. */
  private readonly queues = new Map<string, number>();
  /** Cached runtime stats per session, opaque to the control plane. */
  private readonly stats = new Map<string, Record<string, unknown>>();

  /** Insert or refresh a session from an L2 session snapshot. */
  upsertFromInfo(info: L2SessionInfo, createName?: string): Session {
    const existing = this.records.get(info.id);
    const name = createName ?? existing?.createName ?? null;
    const session: Session = {
      id: info.id,
      title: chooseTitle(info.title, name, info.cwd),
      cwd: info.cwd,
      folder: folderOf(info.cwd),
      state: info.state,
      model: info.model,
      thinkingLevel: info.thinkingLevel,
      createdAt: info.createdAt,
      updatedAt: nowIso(),
      lastError: info.lastError,
    };
    this.records.set(info.id, { session, createName: name });
    return session;
  }

  /** Refresh the whole session list from an L2 agent status snapshot. */
  applyAgentStatus(status: L2AgentStatus): void {
    for (const info of status.sessions) this.upsertFromInfo(info);
  }

  /** Fold one L2 session event into the transcript. */
  applyEvent(sessionId: string, event: L2SessionEvent): void {
    switch (event.kind) {
      case "message.start":
        this.startMessage(sessionId, event.messageId, event.role);
        break;
      case "message.delta":
        this.appendDelta(sessionId, event.messageId, event.channel, event.text);
        break;
      case "tool.start":
        this.startTool(sessionId, event.toolName, event.toolCallId);
        break;
      case "tool.end":
        this.endTool(
          sessionId,
          event.toolName,
          event.toolCallId,
          event.isError === true,
        );
        break;
      case "message.end":
        this.endMessage(sessionId, event.messageId, event.message);
        break;
      case "queue.update":
        this.setQueue(sessionId, event.queued);
        break;
      default:
        break;
    }
    this.touch(sessionId);
  }

  list(): Session[] {
    return [...this.records.values()]
      .map((record) => record.session)
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  }

  get(sessionId: string): Session | null {
    return this.records.get(sessionId)?.session ?? null;
  }

  /** Replace a known session's model after the agent host accepts the change. */
  setModel(sessionId: string, model: string): void {
    this.patch(sessionId, { model });
  }

  /** Replace a known session's thinking level after the agent host accepts it. */
  setThinking(sessionId: string, level: string): void {
    this.patch(sessionId, { thinkingLevel: level });
  }

  /** Record the number of prompts waiting behind the active turn. */
  setQueue(sessionId: string, queued: number): void {
    this.queues.set(sessionId, queued);
  }

  /** Cache opaque runtime stats reported for a session. */
  setStats(sessionId: string, stats: Record<string, unknown>): void {
    this.stats.set(sessionId, stats);
  }

  /** Cached stats for a session, empty until the agent host reports them. */
  statsOf(sessionId: string): Record<string, unknown> {
    return this.stats.get(sessionId) ?? {};
  }

  transcript(sessionId: string): Message[] {
    return [...this.entry(sessionId).messages];
  }

  /**
   * Seed a transcript from a backfill. It is a no-op once the session already
   * has live messages, so a replay cannot duplicate history.
   */
  appendBackfill(sessionId: string, messages: Message[]): void {
    const entry = this.entry(sessionId);
    if (entry.messages.length > 0) return;
    for (const message of messages) {
      if (entry.index.has(message.id)) continue;
      entry.index.set(message.id, entry.messages.length);
      entry.messages.push(message);
    }
  }

  private startMessage(
    sessionId: string,
    messageId: string,
    role: string,
  ): void {
    const entry = this.entry(sessionId);
    const build = entry.builds.get(messageId) ?? emptyBuild(role);
    if (role.length > 0) build.role = role;
    entry.builds.set(messageId, build);
    entry.current = messageId;
  }

  private appendDelta(
    sessionId: string,
    messageId: string,
    channel: "text" | "thinking",
    text: string,
  ): void {
    const entry = this.entry(sessionId);
    const build = entry.builds.get(messageId) ?? emptyBuild("assistant");
    if (channel === "text") build.text += text;
    else build.thinking += text;
    entry.builds.set(messageId, build);
    entry.current = messageId;
  }

  private startTool(
    sessionId: string,
    toolName: string,
    toolCallId: string | undefined,
  ): void {
    const entry = this.entry(sessionId);
    const build = this.currentBuild(entry);
    build.tools.push({
      ...(toolCallId !== undefined ? { id: toolCallId } : {}),
      name: toolName,
      status: "running",
    });
  }

  private endTool(
    sessionId: string,
    toolName: string,
    toolCallId: string | undefined,
    isError: boolean,
  ): void {
    const entry = this.entry(sessionId);
    const build = this.currentBuild(entry);
    const status = isError ? "error" : "ok";
    const match = build.tools.find((tool) =>
      toolCallId !== undefined
        ? tool.id === toolCallId
        : tool.name === toolName && tool.status === "running",
    );
    if (match !== undefined) {
      match.status = status;
      return;
    }
    build.tools.push({
      ...(toolCallId !== undefined ? { id: toolCallId } : {}),
      name: toolName,
      status,
    });
  }

  private endMessage(
    sessionId: string,
    messageId: string,
    message: NormalizedMessage,
  ): void {
    const entry = this.entry(sessionId);
    const build = entry.builds.get(messageId);
    const id = messageId.length > 0 ? messageId : `msg_${randomId(6)}`;
    const tools =
      build !== undefined && build.tools.length > 0
        ? build.tools
        : toolCallsToTools(message.toolCalls);
    const final: Message = {
      id,
      role: message.role.length > 0 ? message.role : (build?.role ?? "assistant"),
      text: message.text.length > 0 ? message.text : (build?.text ?? ""),
      thinking:
        message.thinking.length > 0 ? message.thinking : (build?.thinking ?? ""),
      tools,
      createdAt: nowIso(),
    };
    this.upsert(entry, final);
    entry.builds.delete(messageId);
    if (entry.current === messageId) entry.current = null;
  }

  private upsert(entry: TranscriptEntry, message: Message): void {
    const at = entry.index.get(message.id);
    if (at === undefined) {
      entry.index.set(message.id, entry.messages.length);
      entry.messages.push(message);
      return;
    }
    entry.messages[at] = message;
  }

  private currentBuild(entry: TranscriptEntry): MessageBuild {
    if (entry.current === null) {
      const id = `msg_${randomId(6)}`;
      entry.current = id;
      entry.builds.set(id, emptyBuild("assistant"));
    }
    const id = entry.current;
    let build = entry.builds.get(id);
    if (build === undefined) {
      build = emptyBuild("assistant");
      entry.builds.set(id, build);
    }
    return build;
  }

  private touch(sessionId: string): void {
    const record = this.records.get(sessionId);
    if (record === undefined) return;
    record.session = { ...record.session, updatedAt: nowIso() };
  }

  private patch(
    sessionId: string,
    fields: Partial<Pick<Session, "model" | "thinkingLevel">>,
  ): void {
    const record = this.records.get(sessionId);
    if (record === undefined) return;
    record.session = { ...record.session, ...fields, updatedAt: nowIso() };
  }

  private entry(sessionId: string): TranscriptEntry {
    let entry = this.transcripts.get(sessionId);
    if (entry === undefined) {
      entry = {
        messages: [],
        index: new Map(),
        builds: new Map(),
        current: null,
      };
      this.transcripts.set(sessionId, entry);
    }
    return entry;
  }
}

function emptyBuild(role: string): MessageBuild {
  return {
    role: role.length > 0 ? role : "assistant",
    text: "",
    thinking: "",
    tools: [],
  };
}

function toolCallsToTools(
  toolCalls: NormalizedMessage["toolCalls"],
): MessageTool[] {
  const tools: MessageTool[] = [];
  for (const call of toolCalls) {
    if (call.name === undefined) continue;
    tools.push({
      ...(call.id !== undefined ? { id: call.id } : {}),
      name: call.name,
      status: "ok",
    });
  }
  return tools;
}

/** Agent title, then create name, then the folder, in that order. */
function chooseTitle(
  agentTitle: string | null,
  createName: string | null,
  cwd: string,
): string {
  if (agentTitle !== null && agentTitle.trim().length > 0) return agentTitle;
  if (createName !== null && createName.trim().length > 0) {
    return createName.trim();
  }
  return folderOf(cwd);
}

function folderOf(cwd: string): string {
  const base = basename(cwd);
  return base.length > 0 ? base : cwd;
}
