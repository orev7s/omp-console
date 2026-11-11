import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { WebSocket } from "ws";
import { pairDevice, startTestServer, type TestServer } from "./helpers.js";

interface Frame {
  type: string;
  id?: string;
  ok?: boolean;
  data?: unknown;
  error?: { code: string };
  topic?: string;
  seq?: number;
}

/** A connected client that buffers incoming frames so no message is missed. */
class Client {
  private readonly queue: Frame[] = [];
  private waiter: ((frame: Frame) => void) | null = null;

  constructor(readonly socket: WebSocket) {
    socket.on("message", (data) => {
      const frame = JSON.parse(data.toString()) as Frame;
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

  next(): Promise<Frame> {
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

function connect(url: string, token: string | null): Promise<Client> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, token ? { headers: { authorization: `Bearer ${token}` } } : {});
    ws.once("open", () => resolve(new Client(ws)));
    ws.once("error", (error) => reject(error));
    ws.once("unexpected-response", (_req, res) => reject(new Error(`unexpected-response:${res.statusCode}`)));
  });
}

describe("WebSocket hub", () => {
  let server: TestServer;

  before(async () => {
    server = await startTestServer();
  });

  after(async () => {
    await server.stop();
  });

  it("rejects an upgrade without a token", async () => {
    await assert.rejects(() => connect(server.wsUrl, null), /unexpected-response:401/);
  });

  it("rejects an upgrade with a bad token", async () => {
    await assert.rejects(() => connect(server.wsUrl, "bogus"), /unexpected-response:401/);
  });

  it("sends hello first, then answers echo", async () => {
    const token = await pairDevice(server, "ws-echo");
    const client = await connect(server.wsUrl, token);
    const hello = await client.next();
    assert.equal(hello.type, "hello");

    client.send({ type: "echo", id: "e1", message: "ping!" });
    const reply = await client.next();
    assert.equal(reply.type, "response");
    assert.equal(reply.id, "e1");
    assert.equal(reply.ok, true);
    assert.equal((reply.data as { message: string }).message, "ping!");
    client.close();
  });

  it("answers ping with pong", async () => {
    const token = await pairDevice(server, "ws-ping");
    const client = await connect(server.wsUrl, token);
    await client.next(); // hello
    client.send({ type: "ping", id: "p1" });
    const pong = await client.next();
    assert.equal(pong.type, "pong");
    assert.equal(pong.id, "p1");
    client.close();
  });

  it("delivers server.status events after subscribing", async () => {
    const token = await pairDevice(server, "ws-subscribe");
    const client = await connect(server.wsUrl, token);
    await client.next(); // hello

    client.send({ type: "subscribe", id: "s1", topics: ["server.status"] });
    const ack = await client.next();
    assert.equal(ack.type, "response");
    assert.equal(ack.id, "s1");
    assert.equal(ack.ok, true);

    const first = await client.next();
    assert.equal(first.type, "event");
    assert.equal(first.topic, "server.status");
    assert.equal(typeof first.seq, "number");

    const second = await client.next();
    assert.equal(second.type, "event");
    assert.equal((second.seq ?? 0) > (first.seq ?? 0), true);
    client.close();
  });

  it("returns an error frame for unrecognized input without closing", async () => {
    const token = await pairDevice(server, "ws-bad");
    const client = await connect(server.wsUrl, token);
    await client.next(); // hello

    client.send({ type: "not-a-real-command", id: "x1" });
    const reply = await client.next();
    assert.equal(reply.type, "response");
    assert.equal(reply.ok, false);
    assert.equal(reply.error?.code, "bad_request");
    assert.equal(client.socket.readyState, WebSocket.OPEN);
    client.close();
  });
});

function closed(client: Client): Promise<void> {
  return new Promise((resolve) => {
    if (client.socket.readyState === WebSocket.CLOSED) {
      resolve();
      return;
    }
    client.socket.once("close", () => resolve());
  });
}

interface HubInternals {
  connections: Map<string, { isAlive: boolean; socket: { bufferedAmount: number } }>;
  pingAll: () => void;
  broadcastEvent: (topic: string, data: unknown) => void;
}

describe("WebSocket lifecycle", () => {
  let server: TestServer;

  before(async () => {
    server = await startTestServer();
  });

  after(async () => {
    await server.stop();
  });

  it("cleans up a closed connection and re-subscribes after reconnect", async () => {
    const token = await pairDevice(server, "ws-reconnect");

    const first = await connect(server.wsUrl, token);
    await first.next(); // hello
    first.send({ type: "subscribe", id: "s1", topics: ["server.status"] });
    const firstAck = await first.next();
    assert.equal(firstAck.ok, true);
    const firstEvent = await first.next();
    assert.equal(firstEvent.type, "event");
    first.close();
    await closed(first);
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(server.app.hub.connectionCount(), 0);

    const second = await connect(server.wsUrl, token);
    await second.next(); // hello
    second.send({ type: "subscribe", id: "s2", topics: ["server.status"] });
    const secondAck = await second.next();
    assert.equal(secondAck.ok, true);
    const secondEvent = await second.next();
    assert.equal(secondEvent.type, "event");
    assert.equal(secondEvent.topic, "server.status");
    second.close();
  });

  it("terminates a connection that misses the heartbeat", async () => {
    const token = await pairDevice(server, "ws-heartbeat");
    const client = await connect(server.wsUrl, token);
    const hello = await client.next();
    const connectionId = (hello.data as { connectionId: string }).connectionId;

    const hub = server.app.hub as unknown as HubInternals;
    const connection = hub.connections.get(connectionId);
    assert.ok(connection);
    connection.isAlive = false;
    hub.pingAll();

    await closed(client);
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(server.app.hub.connectionCount(), 0);
  });

  it("disconnects a slow consumer instead of buffering without limit", async () => {
    const token = await pairDevice(server, "ws-slow");
    const client = await connect(server.wsUrl, token);
    const hello = await client.next();
    const connectionId = (hello.data as { connectionId: string }).connectionId;

    client.send({ type: "subscribe", id: "s1", topics: ["server.status"] });
    await client.next(); // subscribe ack
    await client.next(); // immediate snapshot

    const hub = server.app.hub as unknown as HubInternals;
    const connection = hub.connections.get(connectionId);
    assert.ok(connection);
    Object.defineProperty(connection.socket, "bufferedAmount", {
      value: 10_000_000,
      configurable: true,
    });
    hub.broadcastEvent("server.status", {
      agentState: "unavailable",
      connections: 1,
      uptimeSeconds: 1,
      time: new Date().toISOString(),
    });

    await closed(client);
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(server.app.hub.connectionCount(), 0);
  });
});
