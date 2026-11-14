import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import type { Scope } from "@omp-console/protocol";
import type { SessionInfo } from "@omp-console/agent-protocol";
import {
  pairWithScopes,
  startTestServer,
  waitFor,
  type TestServer,
} from "./helpers.js";
import { FakeAgentHost } from "./fake-agent-host.js";

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

function info(
  id: string,
  cwd: string,
  overrides: Partial<SessionInfo> = {},
): SessionInfo {
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

/** Inject a session into the registry through the L2 session.state event. */
async function seed(
  host: FakeAgentHost,
  server: TestServer,
  id: string,
  overrides: Partial<SessionInfo> = {},
): Promise<void> {
  host.send({ type: "session.state", session: info(id, "/tmp/omp-controls", overrides) });
  await waitFor(() => server.app.registry.get(id) !== null);
}

async function startWithAgent(): Promise<{
  server: TestServer;
  host: FakeAgentHost;
  dir: string;
}> {
  const dir = await mkdtemp(join(tmpdir(), "omp-controls-"));
  const host = new FakeAgentHost(join(dir, "agent-host.sock"));
  await host.listen();
  const server = await startTestServer({
    pairingCode: null,
    agentSocketPath: host.socketPath,
  });
  await waitFor(() => server.app.agent.isConnected);
  return { server, host, dir };
}

describe("L1 session control routes with a fake agent host", () => {
  let server: TestServer;
  let host: FakeAgentHost;
  let dir: string;
  let token: string;

  before(async () => {
    const started = await startWithAgent();
    server = started.server;
    host = started.host;
    dir = started.dir;
    token = await pairWithScopes(
      server,
      ["read", "agent", "manage"] as Scope[],
      "controls-user",
    );
  });

  after(async () => {
    await server.stop();
    await host.close();
    await rm(dir, { recursive: true, force: true });
  });

  it("returns an empty model list when the agent host offers none", async () => {
    host.on("session.availableModels", () => ({ models: [] }));
    await seed(host, server, "sess-models-empty");

    const res = await fetch(`${server.baseUrl}/v1/sessions/sess-models-empty/models`, {
      headers: authed(token),
    });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { models: [] });
  });

  it("passes through the models the agent host reports", async () => {
    host.on("session.availableModels", () => ({
      models: [
        { id: "claude-sonnet", name: "Claude Sonnet", provider: "anthropic" },
      ],
    }));
    await seed(host, server, "sess-models-list");

    const res = await fetch(`${server.baseUrl}/v1/sessions/sess-models-list/models`, {
      headers: authed(token),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      models: Array<{ id: string; name?: string; provider?: string }>;
    };
    assert.equal(body.models.length, 1);
    assert.equal(body.models[0]?.id, "claude-sonnet");
    assert.equal(body.models[0]?.provider, "anthropic");
  });

  it("sets a session model on the agent host and in the registry", async () => {
    let seen: unknown = null;
    host.on("session.setModel", (payload) => {
      seen = payload;
      return { accepted: true };
    });
    await seed(host, server, "sess-model");

    const res = await postJson(server, "/v1/sessions/sess-model/model", token, {
      model: "gpt-5",
    });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { accepted: true });
    assert.deepEqual(seen, { sessionId: "sess-model", model: "gpt-5" });
    assert.equal(server.app.registry.get("sess-model")?.model, "gpt-5");
  });

  it("sets a session thinking level on the agent host and in the registry", async () => {
    let seen: unknown = null;
    host.on("session.setThinking", (payload) => {
      seen = payload;
      return { accepted: true };
    });
    await seed(host, server, "sess-thinking");

    const res = await postJson(server, "/v1/sessions/sess-thinking/thinking", token, {
      thinkingLevel: "high",
    });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { accepted: true });
    assert.deepEqual(seen, { sessionId: "sess-thinking", thinkingLevel: "high" });
    assert.equal(server.app.registry.get("sess-thinking")?.thinkingLevel, "high");
  });

  it("returns empty stats by default", async () => {
    host.on("session.stats", () => ({ stats: {} }));
    await seed(host, server, "sess-stats");

    const res = await fetch(`${server.baseUrl}/v1/sessions/sess-stats/stats`, {
      headers: authed(token),
    });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { stats: {} });
  });

  it("steers a session and passes the message to the agent host", async () => {
    let seen: unknown = null;
    host.on("session.steer", (payload) => {
      seen = payload;
      return { accepted: true };
    });
    await seed(host, server, "sess-steer");

    const res = await postJson(server, "/v1/sessions/sess-steer/steer", token, {
      message: "focus on the failing test",
    });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { accepted: true });
    assert.deepEqual(seen, {
      sessionId: "sess-steer",
      message: "focus on the failing test",
    });
  });

  it("follows up on a session and passes the message to the agent host", async () => {
    let seen: unknown = null;
    host.on("session.followUp", (payload) => {
      seen = payload;
      return { accepted: true };
    });
    await seed(host, server, "sess-follow-up");

    const res = await postJson(server, "/v1/sessions/sess-follow-up/follow-up", token, {
      message: "and then tidy up",
    });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { accepted: true });
    assert.deepEqual(seen, {
      sessionId: "sess-follow-up",
      message: "and then tidy up",
    });
  });

  it("pages the transcript with limit and cursor", async () => {
    const id = "sess-messages";
    await seed(host, server, id);
    for (let i = 1; i <= 3; i += 1) {
      host.send({
        type: "session.event",
        sessionId: id,
        event: {
          kind: "message.end",
          messageId: `m${i}`,
          message: { role: "assistant", text: `line ${i}`, thinking: "", toolCalls: [] },
        },
      });
    }
    await waitFor(() => server.app.registry.transcript(id).length === 3);

    const first = await fetch(
      `${server.baseUrl}/v1/sessions/${id}/messages?limit=2`,
      { headers: authed(token) },
    );
    assert.equal(first.status, 200);
    const firstBody = (await first.json()) as {
      messages: Array<{ text: string }>;
      nextCursor: string | null;
    };
    assert.equal(firstBody.messages.length, 2);
    assert.equal(firstBody.messages[0]?.text, "line 1");
    assert.equal(firstBody.nextCursor, "2");

    const second = await fetch(
      `${server.baseUrl}/v1/sessions/${id}/messages?limit=2&cursor=2`,
      { headers: authed(token) },
    );
    assert.equal(second.status, 200);
    const secondBody = (await second.json()) as {
      messages: Array<{ text: string }>;
      nextCursor: string | null;
    };
    assert.equal(secondBody.messages.length, 1);
    assert.equal(secondBody.messages[0]?.text, "line 3");
    assert.equal(secondBody.nextCursor, null);
  });

  it("rejects an out-of-range message limit", async () => {
    await seed(host, server, "sess-messages-bad");
    const res = await fetch(
      `${server.baseUrl}/v1/sessions/sess-messages-bad/messages?limit=501`,
      { headers: authed(token) },
    );
    assert.equal(res.status, 400);
    const body = (await res.json()) as { error: { code: string } };
    assert.equal(body.error.code, "bad_request");
  });

  it("returns 404 for control routes on an unknown session", async () => {
    host.on("session.availableModels", () => ({ models: [] }));
    host.on("session.setModel", () => ({ accepted: true }));
    host.on("session.setThinking", () => ({ accepted: true }));
    host.on("session.stats", () => ({ stats: {} }));
    host.on("session.steer", () => ({ accepted: true }));
    host.on("session.followUp", () => ({ accepted: true }));

    const cases: Array<[string, string, unknown]> = [
      ["GET", "/v1/sessions/nope/models", undefined],
      ["POST", "/v1/sessions/nope/model", { model: "gpt-5" }],
      ["POST", "/v1/sessions/nope/thinking", { thinkingLevel: "low" }],
      ["GET", "/v1/sessions/nope/stats", undefined],
      ["POST", "/v1/sessions/nope/steer", { message: "hello" }],
      ["POST", "/v1/sessions/nope/follow-up", { message: "hello" }],
    ];
    for (const [method, path, body] of cases) {
      const res =
        method === "GET"
          ? await fetch(`${server.baseUrl}${path}`, { headers: authed(token) })
          : await postJson(server, path, token, body);
      assert.equal(res.status, 404, `${method} ${path}`);
      const parsed = (await res.json()) as { error: { code: string } };
      assert.equal(parsed.error.code, "not_found", `${method} ${path}`);
    }
  });

  it("refuses a read-only device on agent control routes", async () => {
    const readOnly = await pairWithScopes(server, ["read"] as Scope[], "controls-reader");
    await seed(host, server, "sess-scope");

    const cases: Array<[string, unknown]> = [
      ["/v1/sessions/sess-scope/model", { model: "gpt-5" }],
      ["/v1/sessions/sess-scope/thinking", { thinkingLevel: "low" }],
      ["/v1/sessions/sess-scope/steer", { message: "hello" }],
      ["/v1/sessions/sess-scope/follow-up", { message: "hello" }],
    ];
    for (const [path, body] of cases) {
      const res = await postJson(server, path, readOnly, body);
      assert.equal(res.status, 403, path);
      const parsed = (await res.json()) as { error: { code: string } };
      assert.equal(parsed.error.code, "forbidden", path);
    }
  });

  it("allows a read-only device to read models and stats", async () => {
    host.on("session.availableModels", () => ({ models: [] }));
    host.on("session.stats", () => ({ stats: {} }));
    const readOnly = await pairWithScopes(server, ["read"] as Scope[], "controls-reader-2");
    await seed(host, server, "sess-read");

    const models = await fetch(`${server.baseUrl}/v1/sessions/sess-read/models`, {
      headers: authed(readOnly),
    });
    assert.equal(models.status, 200);
    const stats = await fetch(`${server.baseUrl}/v1/sessions/sess-read/stats`, {
      headers: authed(readOnly),
    });
    assert.equal(stats.status, 200);
  });
});

describe("L1 session control routes when the agent host is unavailable", () => {
  let server: TestServer;

  before(async () => {
    server = await startTestServer({ pairingCode: null });
  });

  after(async () => {
    await server.stop();
  });

  it("returns a retryable 503 for agent-dependent routes", async () => {
    const token = await pairWithScopes(
      server,
      ["read", "agent"] as Scope[],
      "offline-controls",
    );

    const cases: Array<[string, string, unknown]> = [
      ["GET", "/v1/sessions/any/models", undefined],
      ["POST", "/v1/sessions/any/model", { model: "gpt-5" }],
      ["POST", "/v1/sessions/any/thinking", { thinkingLevel: "high" }],
      ["GET", "/v1/sessions/any/stats", undefined],
      ["POST", "/v1/sessions/any/steer", { message: "hello" }],
      ["POST", "/v1/sessions/any/follow-up", { message: "hello" }],
    ];
    for (const [method, path, body] of cases) {
      const res =
        method === "GET"
          ? await fetch(`${server.baseUrl}${path}`, { headers: authed(token) })
          : await postJson(server, path, token, body);
      assert.equal(res.status, 503, `${method} ${path}`);
      const parsed = (await res.json()) as {
        error: { code: string; retryable: boolean };
      };
      assert.equal(parsed.error.code, "agent_unavailable", `${method} ${path}`);
      assert.equal(parsed.error.retryable, true, `${method} ${path}`);
    }
  });
});
