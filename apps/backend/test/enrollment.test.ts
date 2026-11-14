import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { WebSocket } from "ws";
import type { Scope } from "@omp-console/protocol";
import { migrateStore } from "../src/store/migrate.js";
import { startTestServer, type TestServer } from "./helpers.js";

interface PairBody {
  deviceToken: string;
  deviceId: string;
  scopes: Scope[];
  tokenExpiresAt: string | null;
}

async function pairWithCode(
  server: TestServer,
  code: string,
  deviceName: string,
): Promise<PairBody> {
  const res = await fetch(`${server.baseUrl}/v1/pair`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code, deviceName }),
  });
  const body = (await res.json()) as PairBody & { error?: unknown };
  if (!res.ok) throw new Error(`Pairing failed: ${res.status} ${JSON.stringify(body)}`);
  return body;
}

function authed(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}

interface AnyFrame {
  type: string;
  id?: string;
  ok?: boolean;
  topic?: string;
  data?: unknown;
}

/** Buffered client so no frame is missed between `open` and the first read. */
class WsClient {
  private readonly queue: AnyFrame[] = [];
  private waiter: ((frame: AnyFrame) => void) | null = null;

  constructor(readonly socket: WebSocket) {
    socket.on("message", (data) => {
      const frame = JSON.parse(data.toString()) as AnyFrame;
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

  next(): Promise<AnyFrame> {
    const queued = this.queue.shift();
    if (queued) return Promise.resolve(queued);
    return new Promise((resolve) => {
      this.waiter = resolve;
    });
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

describe("device enrollment and registry", () => {
  let server: TestServer;

  before(async () => {
    // Random codes (not the fixed test code) so per-code scopes are distinct.
    server = await startTestServer({ pairingCode: null });
  });

  after(async () => {
    await server.stop();
  });

  it("pairs multiple devices with independent single-use codes", async () => {
    const codeA = await server.auth.createPairingCode();
    const codeB = await server.auth.createPairingCode();
    const a = await pairWithCode(server, codeA, "phone-a");
    const b = await pairWithCode(server, codeB, "phone-b");

    assert.notEqual(a.deviceToken, b.deviceToken);
    assert.deepEqual(a.scopes, ["read", "agent", "manage"]);

    // A consumed code cannot be reused.
    await assert.rejects(() => pairWithCode(server, codeA, "phone-evil"), /401/);
  });

  it("lists devices and marks the caller as current", async () => {
    const token = await server.auth.createPairingCode();
    const pair = await pairWithCode(server, token, "lister");
    const res = await fetch(`${server.baseUrl}/v1/devices`, { headers: authed(pair.deviceToken) });
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      devices: Array<{ id: string; current?: boolean }>;
    };
    const self = body.devices.find((d) => d.id === pair.deviceId);
    assert.ok(self);
    assert.equal(self.current, true);
  });

  it("renames a device", async () => {
    const code = await server.auth.createPairingCode();
    const pair = await pairWithCode(server, code, "old-name");
    const res = await fetch(`${server.baseUrl}/v1/devices/${pair.deviceId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", ...authed(pair.deviceToken) },
      body: JSON.stringify({ name: "new-name" }),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { devices: Array<{ id: string; name: string }> };
    assert.equal(body.devices.find((d) => d.id === pair.deviceId)?.name, "new-name");
  });

  it("rejects a rename with an empty name", async () => {
    const code = await server.auth.createPairingCode();
    const pair = await pairWithCode(server, code, "valid");
    const res = await fetch(`${server.baseUrl}/v1/devices/${pair.deviceId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", ...authed(pair.deviceToken) },
      body: JSON.stringify({ name: "   " }),
    });
    assert.equal(res.status, 400);
  });

  it("blocks a revoked device over REST and closes its live socket", async () => {
    const code = await server.auth.createPairingCode();
    const victim = await pairWithCode(server, code, "victim");
    const owner = await pairWithCode(server, await server.auth.createPairingCode(), "owner");

    const client = await openClient(server.wsUrl, victim.deviceToken);
    const closed = new Promise<void>((resolve) => client.socket.once("close", () => resolve()));

    const res = await fetch(`${server.baseUrl}/v1/devices/${victim.deviceId}`, {
      method: "DELETE",
      headers: authed(owner.deviceToken),
    });
    assert.equal(res.status, 200);

    await closed;

    const after = await fetch(`${server.baseUrl}/v1/meta`, { headers: authed(victim.deviceToken) });
    assert.equal(after.status, 401);
  });

  it("rotates a token and invalidates the previous one", async () => {
    const code = await server.auth.createPairingCode();
    const pair = await pairWithCode(server, code, "rotate-me");

    const res = await fetch(`${server.baseUrl}/v1/devices/${pair.deviceId}/rotate`, {
      method: "POST",
      headers: authed(pair.deviceToken),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { deviceToken: string; deviceId: string };
    assert.equal(body.deviceId, pair.deviceId);
    assert.notEqual(body.deviceToken, pair.deviceToken);

    const old = await fetch(`${server.baseUrl}/v1/meta`, { headers: authed(pair.deviceToken) });
    assert.equal(old.status, 401);
    const fresh = await fetch(`${server.baseUrl}/v1/meta`, { headers: authed(body.deviceToken) });
    assert.equal(fresh.status, 200);
  });

  it("enforces scopes on REST and WebSocket subscriptions", async () => {
    const readOnly = await pairWithCode(
      server,
      await server.auth.createPairingCode({ scopes: ["read"] }),
      "read-only",
    );
    assert.deepEqual(readOnly.scopes, ["read"]);

    const denied = await fetch(`${server.baseUrl}/v1/devices`, {
      headers: authed(readOnly.deviceToken),
    });
    assert.equal(denied.status, 403);
    const body = (await denied.json()) as { error: { code: string } };
    assert.equal(body.error.code, "forbidden");

    // `read` is enough for server.status, so this subscription is allowed.
    const reader = await openClient(server.wsUrl, readOnly.deviceToken);
    await reader.next(); // hello
    reader.send({ type: "subscribe", id: "s1", topics: ["server.status"] });
    const readerAck = await reader.next();
    assert.equal(readerAck.ok, true);
    assert.deepEqual((readerAck.data as { topics: string[] }).topics, ["server.status"]);
    reader.socket.close();

    // The inverse: manage without read can administer devices but cannot
    // subscribe to status, proving the gate is scope-based, not device-based.
    const manager = await pairWithCode(
      server,
      await server.auth.createPairingCode({ scopes: ["manage"] }),
      "manager",
    );
    const manageOk = await fetch(`${server.baseUrl}/v1/devices`, {
      headers: authed(manager.deviceToken),
    });
    assert.equal(manageOk.status, 200);

    const blocked = await openClient(server.wsUrl, manager.deviceToken);
    await blocked.next(); // hello
    blocked.send({ type: "subscribe", id: "s2", topics: ["server.status"] });
    const blockedAck = await blocked.next();
    assert.equal(blockedAck.ok, true);
    assert.deepEqual((blockedAck.data as { topics: string[] }).topics, []);
    blocked.socket.close();
  });

  it("rejects an expired device token", async () => {
    const shortLived = await startTestServer({ pairingCode: null, deviceTokenTtlMs: 40 });
    try {
      const code = await shortLived.auth.createPairingCode();
      const pair = await pairWithCode(shortLived, code, "temporary");
      assert.notEqual(pair.tokenExpiresAt, null);
      await new Promise((resolve) => setTimeout(resolve, 80));
      const res = await fetch(`${shortLived.baseUrl}/v1/meta`, {
        headers: authed(pair.deviceToken),
      });
      assert.equal(res.status, 401);
    } finally {
      await shortLived.stop();
    }
  });
});

describe("store migration", () => {
  it("migrates a schema v1 file and drops the uncarryable pairing code", () => {
    const migrated = migrateStore({
      schemaVersion: 1,
      serverId: "server-1",
      pairing: { codeHash: "legacy", expiresAt: Date.now() + 1000 },
      devices: [
        {
          id: "dev-1",
          name: "old phone",
          tokenHash: "hash",
          deviceSecretHash: null,
          scopes: ["read"],
          createdAt: "2026-01-01T00:00:00.000Z",
          lastSeenAt: null,
        },
      ],
    });

    assert.equal(migrated.schemaVersion, 3);
    assert.deepEqual(migrated.pairingCodes, []);
    assert.deepEqual(migrated.projects, []);
    assert.equal(migrated.serverId, "server-1");
    assert.equal(migrated.devices.length, 1);
    assert.deepEqual(migrated.devices[0]?.scopes, ["read"]);
    assert.equal(migrated.devices[0]?.revokedAt, null);
    assert.equal(migrated.devices[0]?.tokenExpiresAt, null);
  });

  it("drops unknown scopes and falls back to the default set", () => {
    const migrated = migrateStore({
      schemaVersion: 2,
      serverId: "server-2",
      pairingCodes: [],
      devices: [
        {
          id: "dev-2",
          name: "weird",
          tokenHash: "hash",
          scopes: ["teleport"],
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });
    assert.deepEqual(migrated.devices[0]?.scopes, ["read", "agent", "manage"]);
  });
});