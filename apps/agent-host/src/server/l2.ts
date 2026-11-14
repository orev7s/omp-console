import { createServer, type Server, type Socket } from "node:net";
import { chmod, mkdir, unlink } from "node:fs/promises";
import { dirname } from "node:path";
import { ZodError } from "zod";
import {
  AGENT_PROTOCOL_VERSION,
  AgentEventMessageSchema,
  AgentRequestSchema,
  AgentResponseSchema,
  CreateSessionPayloadSchema,
  FollowUpPayloadSchema,
  MessagesPagePayloadSchema,
  PromptPayloadSchema,
  SessionIdPayloadSchema,
  SessionMessagesPageResponseSchema,
  SessionModelsResponseSchema,
  SessionStatsResponseSchema,
  SetModelPayloadSchema,
  SetThinkingPayloadSchema,
  SteerPayloadSchema,
  SubscribePayloadSchema,
  type AgentEvent,
  type AgentRequest,
  type AgentStatus,
  type Capabilities,
  type CreateSessionPayload,
  type L2Error,
  type ModelInfo,
  type NormalizedMessage,
  type SessionInfo,
  type SessionMessagesPageResponse,
} from "@omp-console/agent-protocol";
import type { Logger } from "../log/index.js";
import { SessionManagerError } from "../sessions/manager.js";

/** The subset of SessionManager the transport needs. */
export interface SessionManagerLike {
  status(): AgentStatus;
  capabilities(): Promise<Capabilities>;
  create(payload: CreateSessionPayload): Promise<SessionInfo>;
  list(): SessionInfo[];
  get(sessionId: string): SessionInfo;
  prompt(sessionId: string, message: string): Promise<void>;
  abort(sessionId: string): Promise<void>;
  messages(sessionId: string): Promise<NormalizedMessage[]>;
  availableModels(sessionId: string): Promise<ModelInfo[]>;
  setModel(sessionId: string, model: string): Promise<void>;
  setThinking(sessionId: string, level: string): Promise<void>;
  stats(sessionId: string): Promise<Record<string, unknown>>;
  steer(sessionId: string, message: string): Promise<void>;
  followUp(sessionId: string, message: string): Promise<void>;
  messagesPage(
    sessionId: string,
    cursor?: string,
    limit?: number,
  ): Promise<SessionMessagesPageResponse>;
  closeSession(sessionId: string): Promise<void>;
}

export interface L2ServerOptions {
  socketPath: string;
  manager: SessionManagerLike;
  logger: Logger;
  /** Maximum socket buffer before a slow client is disconnected. */
  maxBufferedBytes?: number;
  /** Maximum accepted inbound line length. */
  maxRequestBytes?: number;
}

const DEFAULT_MAX_BUFFERED_BYTES = 8 * 1024 * 1024;
const DEFAULT_MAX_REQUEST_BYTES = 1 * 1024 * 1024;

/**
 * Local L2 transport: newline-delimited JSON over a Unix socket, mode 0600.
 * Callers are trusted by socket permissions; there are no tokens here.
 */
export class L2Server {
  private readonly server: Server;
  private readonly sockets = new Set<Socket>();
  private readonly subscriptions = new Map<Socket, Set<string>>();
  private readonly maxBufferedBytes: number;
  private readonly maxRequestBytes: number;

  constructor(private readonly options: L2ServerOptions) {
    this.maxBufferedBytes =
      options.maxBufferedBytes ?? DEFAULT_MAX_BUFFERED_BYTES;
    this.maxRequestBytes = options.maxRequestBytes ?? DEFAULT_MAX_REQUEST_BYTES;
    this.server = createServer((socket) => this.handleConnection(socket));
  }

  async listen(): Promise<void> {
    const { socketPath } = this.options;
    await mkdir(dirname(socketPath), { recursive: true, mode: 0o700 });
    await unlink(socketPath).catch(() => {});
    await new Promise<void>((resolve, reject) => {
      this.server.once("error", reject);
      this.server.listen(socketPath, () => {
        this.server.off("error", reject);
        resolve();
      });
    });
    await chmod(socketPath, 0o600);
    this.options.logger.info("l2 socket listening", { socketPath });
  }

  broadcast(event: AgentEvent): void {
    const message = AgentEventMessageSchema.parse({
      v: AGENT_PROTOCOL_VERSION,
      type: "event",
      event,
    });
    for (const socket of this.sockets) {
      if (event.type === "session.event") {
        const subscribed = this.subscriptions.get(socket);
        if (subscribed === undefined || !subscribed.has(event.sessionId)) {
          continue;
        }
      }
      this.send(socket, message);
    }
  }

  async close(): Promise<void> {
    for (const socket of this.sockets) socket.destroy();
    this.sockets.clear();
    this.subscriptions.clear();
    await new Promise<void>((resolve) => {
      this.server.close(() => resolve());
    });
    await unlink(this.options.socketPath).catch(() => {});
  }

  private handleConnection(socket: Socket): void {
    this.sockets.add(socket);
    this.subscriptions.set(socket, new Set());
    socket.setEncoding("utf8");
    socket.setNoDelay(true);

    let buffer = "";
    socket.on("data", (chunk: string) => {
      buffer += chunk;
      if (buffer.length > this.maxRequestBytes) {
        this.options.logger.warn("l2 client sent an oversized line; closing");
        socket.destroy();
        return;
      }
      let index = buffer.indexOf("\n");
      while (index !== -1) {
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 1);
        if (line.trim().length > 0) {
          void this.handleLine(socket, line);
        }
        index = buffer.indexOf("\n");
      }
    });

    socket.on("close", () => {
      this.sockets.delete(socket);
      this.subscriptions.delete(socket);
    });
    socket.on("error", (error) => {
      this.options.logger.debug("l2 socket error", { error: error.message });
    });
  }

  private async handleLine(socket: Socket, line: string): Promise<void> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      this.sendResponse(socket, "", false, undefined, {
        code: "bad_request",
        message: "request is not valid JSON",
      });
      return;
    }

    const request = AgentRequestSchema.safeParse(parsed);
    if (!request.success) {
      const id =
        typeof parsed === "object" &&
        parsed !== null &&
        typeof (parsed as { id?: unknown }).id === "string"
          ? (parsed as { id: string }).id
          : "";
      this.sendResponse(socket, id, false, undefined, {
        code: "bad_request",
        message: "request does not match the L2 envelope",
      });
      return;
    }

    try {
      const data = await this.dispatch(socket, request.data);
      this.sendResponse(socket, request.data.id, true, data);
    } catch (error) {
      const mapped = mapError(error);
      this.options.logger.warn("l2 request failed", {
        id: request.data.id,
        type: request.data.type,
        code: mapped.code,
        error: mapped.message,
      });
      this.sendResponse(socket, request.data.id, false, undefined, mapped);
    }
  }

  private async dispatch(
    socket: Socket,
    request: AgentRequest,
  ): Promise<unknown> {
    const { manager } = this.options;
    switch (request.type) {
      case "agent.status":
        return manager.status();
      case "agent.capabilities":
        return await manager.capabilities();
      case "session.create":
        return await manager.create(
          CreateSessionPayloadSchema.parse(request.payload ?? {}),
        );
      case "session.list":
        return manager.list();
      case "session.get": {
        const payload = SessionIdPayloadSchema.parse(request.payload);
        return manager.get(payload.sessionId);
      }
      case "session.prompt": {
        const payload = PromptPayloadSchema.parse(request.payload);
        await manager.prompt(payload.sessionId, payload.message);
        return { accepted: true };
      }
      case "session.abort": {
        const payload = SessionIdPayloadSchema.parse(request.payload);
        await manager.abort(payload.sessionId);
        return { aborted: true };
      }
      case "session.messages": {
        const payload = SessionIdPayloadSchema.parse(request.payload);
        const messages = await manager.messages(payload.sessionId);
        return { messages };
      }
      case "session.availableModels": {
        const payload = SessionIdPayloadSchema.parse(request.payload);
        const models = await manager.availableModels(payload.sessionId);
        return SessionModelsResponseSchema.parse({ models });
      }
      case "session.setModel": {
        const payload = SetModelPayloadSchema.parse(request.payload);
        await manager.setModel(payload.sessionId, payload.model);
        return { updated: true };
      }
      case "session.setThinking": {
        const payload = SetThinkingPayloadSchema.parse(request.payload);
        await manager.setThinking(payload.sessionId, payload.thinkingLevel);
        return { updated: true };
      }
      case "session.stats": {
        const payload = SessionIdPayloadSchema.parse(request.payload);
        const stats = await manager.stats(payload.sessionId);
        return SessionStatsResponseSchema.parse({ stats });
      }
      case "session.steer": {
        const payload = SteerPayloadSchema.parse(request.payload);
        await manager.steer(payload.sessionId, payload.message);
        return { accepted: true };
      }
      case "session.followUp": {
        const payload = FollowUpPayloadSchema.parse(request.payload);
        await manager.followUp(payload.sessionId, payload.message);
        return { accepted: true };
      }
      case "session.messagesPage": {
        const payload = MessagesPagePayloadSchema.parse(request.payload);
        const page = await manager.messagesPage(
          payload.sessionId,
          payload.cursor,
          payload.limit,
        );
        return SessionMessagesPageResponseSchema.parse(page);
      }
      case "session.close": {
        const payload = SessionIdPayloadSchema.parse(request.payload);
        await manager.closeSession(payload.sessionId);
        return { closed: true };
      }
      case "session.subscribe": {
        const payload = SubscribePayloadSchema.parse(request.payload);
        this.subscribe(socket, payload.sessionIds);
        return { subscribed: true };
      }
      case "session.unsubscribe": {
        const payload = SubscribePayloadSchema.parse(request.payload);
        this.unsubscribe(socket, payload.sessionIds);
        return { subscribed: false };
      }
    }
  }

  private subscribe(socket: Socket, sessionIds: string[]): void {
    const set = this.subscriptions.get(socket);
    if (set === undefined) return;
    for (const id of sessionIds) set.add(id);
  }

  private unsubscribe(socket: Socket, sessionIds: string[]): void {
    const set = this.subscriptions.get(socket);
    if (set === undefined) return;
    for (const id of sessionIds) set.delete(id);
  }

  private sendResponse(
    socket: Socket,
    id: string,
    ok: boolean,
    data?: unknown,
    error?: L2Error,
  ): void {
    const message = AgentResponseSchema.parse({
      v: AGENT_PROTOCOL_VERSION,
      id: id.length > 0 ? id : "unknown",
      type: "response",
      ok,
      ...(data === undefined ? {} : { data }),
      ...(error === undefined ? {} : { error }),
    });
    this.send(socket, message);
  }

  private send(socket: Socket, message: unknown): void {
    if (socket.destroyed) return;
    if (socket.writableLength > this.maxBufferedBytes) {
      this.options.logger.warn("l2 client is not reading; disconnecting");
      socket.destroy();
      return;
    }
    socket.write(JSON.stringify(message) + "\n");
  }
}

function mapError(error: unknown): L2Error {
  if (error instanceof SessionManagerError) {
    return { code: error.code, message: error.message };
  }
  if (error instanceof ZodError) {
    return {
      code: "bad_request",
      message: error.issues.map((issue) => issue.message).join("; "),
    };
  }
  return { code: "internal", message: "internal error" };
}