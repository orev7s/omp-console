import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";
import { loadConfig } from "../src/config/index.js";
import { toErrorResponse } from "../src/http/handler.js";
import { createLogger } from "../src/log/index.js";
import { pairDevice, startTestServer, type TestServer } from "./helpers.js";

async function postPair(server: TestServer, code: string, deviceName = "test-device", body?: string): Promise<Response> {
  return fetch(`${server.baseUrl}/v1/pair`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body ?? JSON.stringify({ code, deviceName }),
  });
}

describe("HTTP edge cases", () => {
  it("rejects a pairing code that was already used", async () => {
    const server = await startTestServer();
    try {
      await server.reissue();
      const first = await postPair(server, server.pairingCode);
      assert.equal(first.status, 200);
      const second = await postPair(server, server.pairingCode);
      assert.equal(second.status, 401);
      const body = (await second.json()) as { error: { code: string } };
      assert.equal(body.error.code, "unauthorized");
    } finally {
      await server.stop();
    }
  });

  it("rejects an expired pairing code", async () => {
    const server = await startTestServer({ pairingCodeTtlMs: 50 });
    try {
      const code = await server.reissue();
      await new Promise((resolve) => setTimeout(resolve, 120));
      const res = await postPair(server, code);
      assert.equal(res.status, 401);
      const body = (await res.json()) as { error: { code: string } };
      assert.equal(body.error.code, "unauthorized");
    } finally {
      await server.stop();
    }
  });

  it("rate limits pairing attempts", async () => {
    const server = await startTestServer({ rateLimit: { windowMs: 60_000, max: 2 } });
    try {
      const first = await postPair(server, "WRONG123");
      const second = await postPair(server, "WRONG123");
      const third = await postPair(server, "WRONG123");
      assert.equal(first.status, 401);
      assert.equal(second.status, 401);
      assert.equal(third.status, 429);
      const body = (await third.json()) as { error: { code: string } };
      assert.equal(body.error.code, "rate_limited");
    } finally {
      await server.stop();
    }
  });

  it("rejects an oversized body without a stack trace", async () => {
    const server = await startTestServer({ maxBodyBytes: 128 });
    try {
      const body = JSON.stringify({ code: "x".repeat(300), deviceName: "test" });
      const res = await postPair(server, "x", "test", body);
      assert.equal(res.status, 413);
      const parsed = (await res.json()) as { error: { code: string; message: string } };
      assert.equal(parsed.error.code, "payload_too_large");
      assert.equal(/at |\.ts:|\.js:/.test(parsed.error.message), false);
    } finally {
      await server.stop();
    }
  });

  it("maps an internal error to a redacted envelope", async () => {
    const log = createLogger("error", {}, () => undefined);
    const mapped = toErrorResponse(new Error("boom at /srv/secret/path.ts:42"), log);
    assert.equal(mapped.status, 500);
    assert.equal(mapped.code, "internal");
    assert.equal(mapped.message, "Internal server error.");
    assert.equal(/boom|secret|\.ts/.test(mapped.message), false);
  });
});

describe("connection mode configuration", () => {
  const saved: Record<string, string | undefined> = {};
  const keys = [
    "OMP_CONSOLE_DATA_DIR",
    "OMP_CONSOLE_CONFIG",
    "OMP_CONSOLE_HOST",
    "OMP_CONSOLE_PORT",
    "OMP_CONSOLE_LOG_LEVEL",
    "OMP_CONSOLE_CONNECTION_MODE",
    "OMP_CONSOLE_PUBLIC_URL",
    "OMP_CONSOLE_PAIRING_CODE",
    "OMP_CONSOLE_INSECURE_HTTP",
  ];

  beforeEach(() => {
    for (const key of keys) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
    process.env["OMP_CONSOLE_DATA_DIR"] = "/tmp/omp-console-config-test";
    process.env["OMP_CONSOLE_CONFIG"] = "/tmp/omp-console-config-test/missing.json";
  });

  afterEach(() => {
    for (const key of keys) {
      const value = saved[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("refuses a plaintext public bind unless explicitly enabled", () => {
    process.env["OMP_CONSOLE_HOST"] = "0.0.0.0";
    assert.throws(() => loadConfig(), /Refusing to bind non-loopback/);
  });

  it("allows a public bind when insecure HTTP is explicitly enabled", () => {
    process.env["OMP_CONSOLE_HOST"] = "0.0.0.0";
    process.env["OMP_CONSOLE_INSECURE_HTTP"] = "1";
    const config = loadConfig();
    assert.equal(config.insecureHttp, true);
    assert.equal(config.host, "0.0.0.0");
  });

  it("defaults to loopback and HTTP disabled", () => {
    const config = loadConfig();
    assert.equal(config.host, "127.0.0.1");
    assert.equal(config.insecureHttp, false);
    assert.equal(config.connectionMode, "https_domain");
  });
});

describe("HTTP API", () => {
  let server: TestServer;

  before(async () => {
    server = await startTestServer();
  });

  after(async () => {
    await server.stop();
  });

  it("serves health without authentication", async () => {
    const res = await fetch(`${server.baseUrl}/v1/health`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as Record<string, unknown>;
    assert.equal(body["status"], "ok");
    assert.equal(body["apiVersion"], 1);
    assert.equal(res.headers.get("x-request-id")?.startsWith("req_"), true);
  });

  it("rejects meta without credentials", async () => {
    const res = await fetch(`${server.baseUrl}/v1/meta`);
    assert.equal(res.status, 401);
    const body = (await res.json()) as { error: { code: string } };
    assert.equal(body.error.code, "unauthorized");
  });

  it("rejects an unknown bearer token", async () => {
    const res = await fetch(`${server.baseUrl}/v1/meta`, {
      headers: { authorization: "Bearer not-a-real-token" },
    });
    assert.equal(res.status, 401);
  });

  it("rejects a wrong pairing code", async () => {
    const res = await fetch(`${server.baseUrl}/v1/pair`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: "WRONG123", deviceName: "phone" }),
    });
    assert.equal(res.status, 401);
  });

  it("rejects a malformed pairing body", async () => {
    const res = await fetch(`${server.baseUrl}/v1/pair`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: "", deviceName: "" }),
    });
    assert.equal(res.status, 400);
  });

  it("rejects invalid JSON with a bad_request envelope", async () => {
    const res = await fetch(`${server.baseUrl}/v1/pair`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{ not json",
    });
    assert.equal(res.status, 400);
    const body = (await res.json()) as { error: { code: string } };
    assert.equal(body.error.code, "bad_request");
  });

  it("pairs with the configured code and returns a device token", async () => {
    const token = await pairDevice(server, "phone-a");
    assert.ok(token.length >= 20);
  });

  it("returns meta for a valid device", async () => {
    const token = await pairDevice(server, "phone-b");
    const res = await fetch(`${server.baseUrl}/v1/meta`, {
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      agentState: string;
      capabilities: { agentHost: boolean };
      serverId: string;
    };
    assert.equal(body.agentState, "unavailable");
    assert.equal(body.capabilities.agentHost, false);
    assert.ok(body.serverId.length > 0);
  });

  it("returns a 404 envelope for an unknown route", async () => {
    const res = await fetch(`${server.baseUrl}/v1/does-not-exist`);
    assert.equal(res.status, 404);
    const body = (await res.json()) as { error: { code: string } };
    assert.equal(body.error.code, "not_found");
  });
});
