import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { after, before, describe, it } from "node:test";
import { WebSocket } from "ws";
import { sessionEventTopic, type Scope } from "@omp-console/protocol";
import type { SessionInfo } from "@omp-console/agent-protocol";
import {
  pairDevice,
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

function authed(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}

async function postJson(
  server: TestServer,
  path: string,
  token: string,
  body: unknown,
): Promise<Response> {
  return fetch(`${server.baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...authed(token) },
    body: JSON.stringify(body),
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

async function startWithAgent(): Promise<{
  server: TestServer;
  host: FakeAgentHost;
  dir: string;
}> {
  const dir = await mkdtemp(join(tmpdir(), "omp-sessions-"));
  const host = new FakeAgentHost(join(dir, "agent-host.sock"));
  await host.listen();
  const server = await startTestServer({
    pairingCode: null,
    agentSocketPath: host.socketPath,
  });
  await waitFor(() => server.app.agent.isConnected);
  return { server, host, dir };
}

describe("L1 session API with a fake agent host", () => {
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

  it("creates, lists, gets, prompts, and aborts a session", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "omp-cwd-"));
    host.on("session.create", (payload) =>
      info("sess-create", (payload as { cwd?: string }).cwd ?? cwd),
    );
    host.on("session.prompt", () => ({ accepted: true }));
    host.on("session.abort", () => ({ aborted: true }));

    const token = await pairWithScopes(
      server,
      ["read", "agent", "manage"] as Scope[],
      "session-user",
    );

    const created = await postJson(server, "/v1/sessions", token, {
      cwd,
      name: "Friendly Name",
    });
    assert.equal(created.status, 201);
    const createdBody = (await created.json()) as { session: { id: string; folder: string; title: string } };
    assert.equal(createdBody.session.id, "sess-create");
    assert.equal(createdBody.session.folder, basename(cwd));
    assert.equal(createdBody.session.title, "Friendly Name");

    // The control plane subscribes to a freshly created session.
    await host.waitForRequest("session.subscribe");

    const list = await fetch(`${server.baseUrl}/v1/sessions`, { headers: authed(token) });
    assert.equal(list.status, 200);
    const listBody = (await list.json()) as { sessions: Array<{ id: string }> };
    assert.ok(listBody.sessions.some((s) => s.id === "sess-create"));

    const detail = await fetch(`${server.baseUrl}/v1/sessions/sess-create`, {
      headers: authed(token),
    });
    assert.equal(detail.status, 200);
    const detailBody = (await detail.json()) as { session: { state: string } };
    assert.equal(detailBody.session.state, "ready");

    const prompt = await postJson(server, "/v1/sessions/sess-create/prompt", token, {
      message: "say hello",
    });
    assert.equal(prompt.status, 200);
    assert.deepEqual(await prompt.json(), { accepted: true });

    const abort = await postJson(server, "/v1/sessions/sess-create/abort", token, {});
    assert.equal(abort.status, 200);
    assert.deepEqual(await abort.json(), { aborted: true });
  });

  it("resolves projectId to the project path as cwd", async () => {
    const projectDir = await mkdtemp(join(tmpdir(), "omp-project-"));
    let seenCwd: string | null = null;
    host.on("session.create", (payload) => {
      seenCwd = (payload as { cwd?: string }).cwd ?? null;
      return info("sess-project", seenCwd ?? projectDir);
    });

    const token = await pairWithScopes(
      server,
      ["read", "agent", "manage"] as Scope[],
      "project-user",
    );
    const added = await postJson(server, "/v1/projects", token, { path: projectDir });
    assert.equal(added.status, 201);
    const project = ((await added.json()) as { project: { id: string } }).project;

    const created = await postJson(server, "/v1/sessions", token, {
      projectId: project.id,
    });
    assert.equal(created.status, 201);
    assert.equal(seenCwd, projectDir);
  });

  it("prefers the agent host title over the created name", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "omp-title-"));
    host.on("session.create", () => info("sess-title", cwd));
    const token = await pairWithScopes(
      server,
      ["read", "agent", "manage"] as Scope[],
      "title-user",
    );

    const created = await postJson(server, "/v1/sessions", token, {
      cwd,
      name: "Created Name",
    });
    const createdBody = (await created.json()) as { session: { title: string } };
    assert.equal(createdBody.session.title, "Created Name");

    host.send({
      type: "session.state",
      session: info("sess-title", cwd, { title: "Agent Named It" }),
    });
    await waitFor(() => server.app.registry.get("sess-title")?.title === "Agent Named It");

    const detail = await fetch(`${server.baseUrl}/v1/sessions/sess-title`, {
      headers: authed(token),
    });
    const detailBody = (await detail.json()) as { session: { title: string } };
    assert.equal(detailBody.session.title, "Agent Named It");
  });

  it("returns 404 for an unknown session", async () => {
    const token = await pairWithScopes(server, ["read"] as Scope[], "missing-user");
    const detail = await fetch(`${server.baseUrl}/v1/sessions/nope`, {
      headers: authed(token),
    });
    assert.equal(detail.status, 404);
    const body = (await detail.json()) as { error: { code: string } };
    assert.equal(body.error.code, "not_found");
  });

  it("streams a session event over its topic and builds a transcript", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "omp-ws-"));
    host.on("session.create", () => info("sess-ws", cwd));
    const token = await pairWithScopes(
      server,
      ["read", "agent", "manage"] as Scope[],
      "ws-user",
    );
    await postJson(server, "/v1/sessions", token, { cwd });

    const client = await openClient(server.wsUrl, token);
    await client.next(); // hello
    client.send({
      type: "subscribe",
      id: "s1",
      topics: [sessionEventTopic("sess-ws")],
    });
    const ack = await client.next();
    assert.equal(ack.ok, true);
    assert.deepEqual((ack.data as { topics: string[] }).topics, [
      sessionEventTopic("sess-ws"),
    ]);

    host.send({
      type: "session.event",
      sessionId: "sess-ws",
      event: { kind: "message.start", messageId: "m1", role: "assistant" },
    });
    host.send({
      type: "session.event",
      sessionId: "sess-ws",
      event: {
        kind: "message.delta",
        messageId: "m1",
        channel: "text",
        text: "hello world",
      },
    });
    host.send({
      type: "session.event",
      sessionId: "sess-ws",
      event: {
        kind: "message.end",
        messageId: "m1",
        message: { role: "assistant", text: "hello world", thinking: "", toolCalls: [] },
      },
    });

    // The topic carries every event, not just the final one; find the end.
    let event = await client.next();
    while (
      event.type === "event" &&
      (event.data as { event?: { kind?: string } }).event?.kind !== "message.end"
    ) {
      event = await client.next();
    }
    assert.equal(event.type, "event");
    assert.equal(event.topic, sessionEventTopic("sess-ws"));
    const payload = event.data as {
      sessionId: string;
      event: { kind: string; text?: string };
    };
    assert.equal(payload.sessionId, "sess-ws");
    assert.equal(payload.event.kind, "message.end");
    assert.equal(payload.event.text, "hello world");

    const messages = await fetch(`${server.baseUrl}/v1/sessions/sess-ws/messages`, {
      headers: authed(token),
    });
    assert.equal(messages.status, 200);
    const body = (await messages.json()) as {
      messages: Array<{ text: string; role: string }>;
      nextCursor: string | null;
    };
    assert.equal(body.messages.length, 1);
    assert.equal(body.messages[0]?.text, "hello world");
    assert.equal(body.messages[0]?.role, "assistant");
    assert.equal(body.nextCursor, null);

    client.close();
  });

  it("backfills a transcript from the agent host when there is none", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "omp-backfill-"));
    host.on("session.create", () => info("sess-backfill", cwd));
    host.on("session.messages", () => ({
      messages: [
        { role: "user", text: "first prompt", thinking: "", toolCalls: [] },
        {
          role: "assistant",
          text: "reply",
          thinking: "pondering",
          toolCalls: [{ id: "t1", name: "read" }],
        },
      ],
    }));
    const token = await pairWithScopes(
      server,
      ["read", "agent", "manage"] as Scope[],
      "backfill-user",
    );
    await postJson(server, "/v1/sessions", token, { cwd });

    const res = await fetch(`${server.baseUrl}/v1/sessions/sess-backfill/messages`, {
      headers: authed(token),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      messages: Array<{ text: string; thinking: string; tools: Array<{ name: string }> }>;
    };
    assert.equal(body.messages.length, 2);
    assert.equal(body.messages[0]?.text, "first prompt");
    assert.equal(body.messages[1]?.thinking, "pondering");
    assert.equal(body.messages[1]?.tools[0]?.name, "read");
    await rm(cwd, { recursive: true, force: true });
  });

  it("enforces scopes on session routes", async () => {
    const readOnly = await pairWithScopes(server, ["read"] as Scope[], "sessions-reader");
    const canList = await fetch(`${server.baseUrl}/v1/sessions`, {
      headers: authed(readOnly),
    });
    assert.equal(canList.status, 200);
    const cannotCreate = await postJson(server, "/v1/sessions", readOnly, { cwd: dir });
    assert.equal(cannotCreate.status, 403);

    const agentOnly = await pairWithScopes(server, ["agent"] as Scope[], "sessions-agent");
    const cannotList = await fetch(`${server.baseUrl}/v1/sessions`, {
      headers: authed(agentOnly),
    });
    assert.equal(cannotList.status, 403);
  });
});

describe("L1 session API when the agent host is unavailable", () => {
  let server: TestServer;

  before(async () => {
    server = await startTestServer();
  });

  after(async () => {
    await server.stop();
  });

  it("lists sessions (empty) without an agent host", async () => {
    const token = await pairDevice(server, "offline-reader");
    const res = await fetch(`${server.baseUrl}/v1/sessions`, { headers: authed(token) });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { sessions: unknown[] };
    assert.deepEqual(body.sessions, []);
  });

  it("returns a retryable 503 when creating a session", async () => {
    const token = await pairDevice(server, "offline-creator");
    const res = await postJson(server, "/v1/sessions", token, {});
    assert.equal(res.status, 503);
    const body = (await res.json()) as { error: { code: string; retryable: boolean } };
    assert.equal(body.error.code, "agent_unavailable");
    assert.equal(body.error.retryable, true);
  });
});

describe("WebSocket session topic scoping", () => {
  let server: TestServer;

  before(async () => {
    server = await startTestServer({ pairingCode: null });
  });

  after(async () => {
    await server.stop();
  });

  it("denies session topics to a device without the read scope", async () => {
    const token = await pairWithScopes(server, ["manage"] as Scope[], "ws-manage");
    const client = await openClient(server.wsUrl, token);
    await client.next(); // hello
    client.send({
      type: "subscribe",
      id: "s1",
      topics: [sessionEventTopic("any"), "agent.status"],
    });
    const ack = await client.next();
    assert.equal(ack.ok, true);
    assert.deepEqual((ack.data as { topics: string[] }).topics, []);
    client.close();
  });

  it("allows a session topic for a device with the read scope", async () => {
    const token = await pairWithScopes(server, ["read"] as Scope[], "ws-reader");
    const client = await openClient(server.wsUrl, token);
    await client.next(); // hello
    client.send({
      type: "subscribe",
      id: "s1",
      topics: [sessionEventTopic("any")],
    });
    const ack = await client.next();
    assert.equal(ack.ok, true);
    assert.deepEqual((ack.data as { topics: string[] }).topics, [
      sessionEventTopic("any"),
    ]);
    client.close();
  });
});
