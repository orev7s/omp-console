import { connect, type Socket } from "node:net";
import {
  AGENT_PROTOCOL_VERSION,
  AgentEventMessageSchema,
  AgentResponseSchema,
  type AgentEvent,
} from "@omp-console/agent-protocol";

/** Small L2 client used by integration tests. Not production code. */
export class L2TestClient {
  private socket: Socket | null = null;
  private buffer = "";
  private nextId = 1;
  private readonly pending = new Map<
    string,
    {
      type: string;
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
    }
  >();
  private readonly events: AgentEvent[] = [];
  private readonly waiters = new Set<{
    predicate: (event: AgentEvent) => boolean;
    resolve: (event: AgentEvent) => void;
  }>();

  constructor(private readonly path: string) {}

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = connect(this.path);
      this.socket = socket;
      socket.setEncoding("utf8");
      socket.once("connect", () => resolve());
      socket.once("error", reject);
      socket.on("data", (chunk: string) => this.onData(chunk));
    });
  }

  request(type: string, payload?: unknown): Promise<unknown> {
    const socket = this.socket;
    if (socket === null) return Promise.reject(new Error("not connected"));
    const id = `t${this.nextId}`;
    this.nextId += 1;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`timed out waiting for ${type}`));
      }, 60_000);
      timer.unref();
      this.pending.set(id, { type, resolve, reject });
      socket.write(
        JSON.stringify({
          v: AGENT_PROTOCOL_VERSION,
          id,
          type,
          ...(payload === undefined ? {} : { payload }),
        }) + "\n",
      );
    });
  }

  waitFor(
    predicate: (event: AgentEvent) => boolean,
    timeoutMs: number,
  ): Promise<AgentEvent> {
    const existing = this.events.find(predicate);
    if (existing !== undefined) return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiters.delete(waiter);
        reject(new Error("timed out waiting for a matching event"));
      }, timeoutMs);
      timer.unref();
      const waiter = {
        predicate,
        resolve: (event: AgentEvent) => {
          clearTimeout(timer);
          resolve(event);
        },
      };
      this.waiters.add(waiter);
    });
  }

  close(): void {
    this.socket?.destroy();
    this.socket = null;
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
      return;
    }

    const response = AgentResponseSchema.safeParse(parsed);
    if (response.success) {
      const pending = this.pending.get(response.data.id);
      if (pending !== undefined) {
        this.pending.delete(response.data.id);
        if (response.data.ok) pending.resolve(response.data.data);
        else
          pending.reject(
            new Error(
              `${pending.type} failed: ${response.data.error?.code ?? "unknown"}: ${
                response.data.error?.message ?? "no message"
              }`,
            ),
          );
      }
      return;
    }

    const event = AgentEventMessageSchema.safeParse(parsed);
    if (!event.success) return;
    this.events.push(event.data.event);
    for (const waiter of [...this.waiters]) {
      if (!waiter.predicate(event.data.event)) continue;
      this.waiters.delete(waiter);
      waiter.resolve(event.data.event);
    }
  }
}