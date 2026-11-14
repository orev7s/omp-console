import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { WebSocket } from "ws";
import {
  TOPICS,
  sessionEventTopic,
  type Scope,
} from "@omp-console/protocol";
import type { SessionInfo } from "@omp-console/agent-protocol";
import {
  pairWithScopes,
  startTestServer,
  waitFor,
  type TestServer,
} from "./helpers.js";
import { FakeAgentHost } from "./fake-agent-host.js";

interface WsFrame {
  type: string;
  id?: string;
  ok?: boolean;
  data?: unknown;
  topic?: string;
  seq?: number;
}

class WsClient {
  private readonly queue: WsFrame[] = [];
  private waiter: ((frame: WsFrame) => void) | null = null;

  constructor(readonly socket: WebSocket) {
    socket.on("message", (data) => {
      const frame = JSON.parse(data.toString()) as WsFrame;
      if (this.waiter) {
        const resolve = this.waiter;
        this.waiter = null;
        resolve(frame);
      } else {
        this.queue.push(frame);
      }
    });
  }

  send(frame: Record<string, unknown>): void {
    this.socket.send(JSON.stringify({ v: 1, ts: Date.now(), ...frame }));
  }

  next(): Promise<WsFrame> {
    const queued = this.queue.shift();
    if (queued) return Promise.resolve(queued);
    return new Promise((resolve) => {
      this.waiter = resolve;
    });
  }

  close(): void {
    this.socket.close();
  }
}

function openClient(url: string, token: string): Promise<WsClient> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, { headers: { authorization: `Bearer ${token}` } });
    const client = new WsClient(ws);
    ws.once("open", () => resolve(client));
    ws.once("error", reject);
  });
}

function info(id: string, cwd: string, overrides: Partial<SessionInfo> = {}): SessionInfo {
  return {
    id,
    title: null,
    cwd,
    model: null,
    thinkingLevel: null,
    state: "ready",
    sessionFile: null,
    createdAt: new Date().toISOString(),
    lastError: null,
    ...overrides,
  };
}

/** The registry keeps its queue counts private; read them the way ws.test does. */
interface RegistryInternals {
  queues: Map<string, number>;
}

function queueCount(server: TestServer, sessionId: string): number {
  const registry = server.app.registry as unknown as RegistryInternals;
  return registry.queues.get(sessionId) ?? 0;
}

async function startWithAgent(): Promise<{
  server: TestServer;
  host: FakeAgentHost;
  dir: string;
}> {
  const dir = await mkdtemp(join(tmpdir(), "omp-live-"));
  const host = new FakeAgentHost(join(dir, "agent-host.sock"));
  await host.listen();
  const server = await startTestServer({
    pairingCode: null,
    agentSocketPath: host.socketPath,
  });
  await waitFor(() => server.app.agent.isConnected);
  return { server, host, dir };
}

describe("Live session events", () => {
  let server: TestServer;
  let host: FakeAgentHost;
  let dir: string;

  before(async () => {
    const started = await startWithAgent();
    server = started.server;
    host = started.host;
    dir = started.dir;
  });

  after(async () => {
    await server.stop();
    await host.close();
    await rm(dir, { recursive: true, force: true });
  });

  it("streams a queue.update event and records the queue count", async () => {
    const id = "sess-queue";
    host.send({ type: "session.state", session: info(id, "/tmp/omp-queue") });
    await waitFor(() => server.app.registry.get(id) !== null);

    const token = await pairWithScopes(server, ["read"] as Scope[], "queue-reader");
    const client = await openClient(server.wsUrl, token);
    await client.next(); // hello
    client.send({ type: "subscribe", id: "q1", topics: [sessionEventTopic(id)] });
    const ack = await client.next();
    assert.equal(ack.ok, true);

    host.send({
      type: "session.event",
      sessionId: id,
      event: { kind: "queue.update", queued: 3 },
    });

    const event = await client.next();
    assert.equal(event.type, "event");
    assert.equal(event.topic, sessionEventTopic(id));
    const payload = event.data as {
      sessionId: string;
      event: { kind: string; queued?: number };
    };
    assert.equal(payload.sessionId, id);
    assert.equal(payload.event.kind, "queue.update");
    assert.equal(payload.event.queued, 3);
    assert.equal(queueCount(server, id), 3);
    client.close();
  });

  it("broadcasts agent.status with sessions when a session state changes", async () => {
    const token = await pairWithScopes(server, ["read"] as Scope[], "status-reader");
    const client = await openClient(server.wsUrl, token);
    await client.next(); // hello
    client.send({ type: "subscribe", id: "a1", topics: [TOPICS.agentStatus] });
    const ack = await client.next();
    assert.equal(ack.ok, true);

    const snapshot = await client.next();
    assert.equal(snapshot.type, "event");
    assert.equal(snapshot.topic, TOPICS.agentStatus);
    const beforeData = snapshot.data as { sessions: unknown[] };
    assert.ok(Array.isArray(beforeData.sessions));

    const id = "sess-status";
    host.send({
      type: "session.state",
      session: info(id, "/tmp/omp-status", { state: "busy" }),
    });

    const change = await client.next();
    assert.equal(change.type, "event");
    assert.equal(change.topic, TOPICS.agentStatus);
    const data = change.data as { sessions: Array<{ id: string; state: string }> };
    const session = data.sessions.find((candidate) => candidate.id === id);
    assert.ok(session, "session present in the agent.status payload");
    assert.equal(session?.state, "busy");
    client.close();
  });
});
