import { mkdir, rm } from "node:fs/promises";
import { createServer, type Server, type Socket } from "node:net";
import { dirname } from "node:path";
import {
  AGENT_PROTOCOL_VERSION,
  AgentEventMessageSchema,
  AgentResponseSchema,
  type AgentEvent,
} from "@omp-console/agent-protocol";

export interface AgentRequestRecord {
  type: string;
  payload: unknown;
}

type Handler = (payload: unknown) => unknown | Promise<unknown>;

/**
 * A minimal L2 peer for backend tests. It speaks the agent-protocol envelope
 * over a Unix socket and lets a test script responses and push events, so the
 * control plane can be exercised without a real `omp` child.
 */
export class FakeAgentHost {
  private readonly server: Server;
  private readonly sockets = new Set<Socket>();
  private readonly buffers = new WeakMap<Socket, string>();
  private readonly handlers = new Map<string, Handler>();
  private readonly waiters = new Set<{
    predicate: (request: AgentRequestRecord) => boolean;
    resolve: (request: AgentRequestRecord) => void;
    timer: NodeJS.Timeout;
  }>();

  readonly requests: AgentRequestRecord[] = [];

  constructor(readonly socketPath: string) {
    this.server = createServer((socket) => this.onConnection(socket));
    this.handlers.set("agent.status", () => ({
      state: "stopped",
      pid: process.pid,
      uptimeMs: 0,
      sessions: [],
    }));
    this.handlers.set("agent.capabilities", () => ({
      ompVersion: "test-omp",
      protocolVersion: 1,
      supportedProtocolVersions: [1],
      commands: [],
      loginProviders: null,
    }));
    this.handlers.set("session.subscribe", () => ({ subscribed: true }));
    this.handlers.set("session.unsubscribe", () => ({ subscribed: false }));
  }

  async listen(): Promise<void> {
    await mkdir(dirname(this.socketPath), { recursive: true });
    await rm(this.socketPath, { force: true });
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error): void => reject(error);
      this.server.once("error", onError);
      this.server.listen(this.socketPath, () => {
        this.server.off("error", onError);
        resolve();
      });
    });
  }

  on(type: string, handler: Handler): void {
    this.handlers.set(type, handler);
  }

  waitForRequest(type: string, timeoutMs = 3_000): Promise<AgentRequestRecord> {
    const existing = this.requests.find((request) => request.type === type);
    if (existing !== undefined) return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiters.delete(waiter);
        reject(new Error(`timed out waiting for ${type}`));
      }, timeoutMs);
      timer.unref();
      const waiter = {
        predicate: (request: AgentRequestRecord) => request.type === type,
        resolve: (request: AgentRequestRecord) => {
          clearTimeout(timer);
          resolve(request);
        },
        timer,
      };
      this.waiters.add(waiter);
    });
  }

  /** Push an event to every connected control plane. */
  send(event: AgentEvent): void {
    const message = AgentEventMessageSchema.parse({
      v: AGENT_PROTOCOL_VERSION,
      type: "event",
      event,
    });
    for (const socket of this.sockets) this.write(socket, message);
  }

  async close(): Promise<void> {
    for (const socket of this.sockets) socket.destroy();
    this.sockets.clear();
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
    await rm(this.socketPath, { force: true });
  }

  private onConnection(socket: Socket): void {
    this.sockets.add(socket);
    this.buffers.set(socket, "");
    socket.setEncoding("utf8");
    socket.on("data", (chunk: string) => this.onData(socket, chunk));
    socket.on("close", () => {
      this.sockets.delete(socket);
    });
    socket.on("error", () => {
      // A client disconnect is expected in tests; nothing to do.
    });
  }

  private onData(socket: Socket, chunk: string): void {
    let buffer = (this.buffers.get(socket) ?? "") + chunk;
    let index = buffer.indexOf("\n");
    while (index !== -1) {
      const line = buffer.slice(0, index);
      buffer = buffer.slice(index + 1);
      if (line.trim().length > 0) void this.handleLine(socket, line);
      index = buffer.indexOf("\n");
    }
    this.buffers.set(socket, buffer);
  }

  private async handleLine(socket: Socket, line: string): Promise<void> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      return;
    }
    if (typeof parsed !== "object" || parsed === null) return;
    const request = parsed as { id?: unknown; type?: unknown; payload?: unknown };
    const id = typeof request.id === "string" ? request.id : "unknown";
    const type = typeof request.type === "string" ? request.type : "";
    const record: AgentRequestRecord = { type, payload: request.payload };
    this.requests.push(record);
    for (const waiter of [...this.waiters]) {
      if (!waiter.predicate(record)) continue;
      this.waiters.delete(waiter);
      waiter.resolve(record);
    }

    const handler = this.handlers.get(type);
    if (handler === undefined) {
      this.sendResponse(socket, id, false, {
        code: "bad_request",
        message: `unhandled ${type}`,
      });
      return;
    }
    try {
      this.sendResponse(socket, id, true, await handler(request.payload));
    } catch (error) {
      this.sendResponse(socket, id, false, {
        code: "internal",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private sendResponse(
    socket: Socket,
    id: string,
    ok: boolean,
    body: unknown,
  ): void {
    const message = AgentResponseSchema.parse({
      v: AGENT_PROTOCOL_VERSION,
      id,
      type: "response",
      ok,
      ...(ok ? { data: body } : { error: body }),
    });
    this.write(socket, message);
  }

  private write(socket: Socket, message: unknown): void {
    if (socket.destroyed) return;
    socket.write(JSON.stringify(message) + "\n");
  }
}
