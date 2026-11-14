import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Scope } from "@omp-console/protocol";
import type { Config } from "../src/config/index.js";
import { createLogger } from "../src/log/index.js";
import { Store } from "../src/store/index.js";
import { AuthService } from "../src/auth/index.js";
import { createApp, type App } from "../src/app.js";

export interface TestServer {
  app: App;
  config: Config;
  auth: AuthService;
  baseUrl: string;
  wsUrl: string;
  /** Pairing code configured for the run. */
  pairingCode: string;
  /** Mint a fresh pairing code (the code is single-use). */
  reissue(): Promise<string>;
  stop(): Promise<void>;
}

const TEST_PAIRING_CODE = "TESTCODE";

function testConfig(dataDir: string, overrides: Partial<Config> = {}): Config {
  return {
    name: "OMP Console Test",
    host: "127.0.0.1",
    port: 0,
    dataDir,
    insecureHttp: false,
    connectionMode: "https_domain",
    publicUrl: null,
    pairingCode: TEST_PAIRING_CODE,
    pairingCodeTtlMs: 60_000,
    deviceTokenTtlMs: null,
    heartbeatMs: 150,
    logLevel: "error",
    maxBodyBytes: 16 * 1024,
    maxBufferedBytes: 256 * 1024,
    rateLimit: { windowMs: 60_000, max: 1000 },
    pairingRateLimit: { windowMs: 60_000, max: 1000 },
    storePath: join(dataDir, "state.json"),
    agentSocketPath: join(dataDir, "agent-host.sock"),
    ...overrides,
  };
}

export async function startTestServer(overrides: Partial<Config> = {}): Promise<TestServer> {
  const dataDir = await mkdtemp(join(tmpdir(), "omp-console-test-"));
  const config = testConfig(dataDir, overrides);
  const log = createLogger("error", {}, () => undefined);
  const store = await Store.open(config.storePath);
  const auth = new AuthService(store, config, log);
  await auth.ensurePairingCode();

  const app = createApp({ config, log, store, auth });
  await app.start();
  const { port } = app.address();

  return {
    app,
    config,
    auth,
    baseUrl: `http://127.0.0.1:${port}`,
    wsUrl: `ws://127.0.0.1:${port}/v1/ws`,
    pairingCode: TEST_PAIRING_CODE,
    async reissue() {
      const code = await auth.ensurePairingCode(true);
      return code ?? TEST_PAIRING_CODE;
    },
    async stop() {
      await app.stop();
    },
  };
}

/** Poll a synchronous condition until it holds or the timeout elapses. */
export async function waitFor(
  predicate: () => boolean,
  timeoutMs = 3_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("condition was not met before the timeout");
}

/**
 * Pair a device with an explicit scope set. Requires the server to run with
 * `pairingCode: null` so each minted code is distinct.
 */
export async function pairWithScopes(
  server: TestServer,
  scopes: Scope[],
  deviceName = "scoped-device",
): Promise<string> {
  const code = await server.auth.createPairingCode({ scopes });
  const res = await fetch(`${server.baseUrl}/v1/pair`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code, deviceName }),
  });
  const body = (await res.json()) as { deviceToken?: string };
  if (!res.ok || !body.deviceToken) {
    throw new Error(`Pairing failed: ${res.status} ${JSON.stringify(body)}`);
  }
  return body.deviceToken;
}

export async function pairDevice(server: TestServer, deviceName = "test-device"): Promise<string> {
  await server.reissue();
  const res = await fetch(`${server.baseUrl}/v1/pair`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code: TEST_PAIRING_CODE, deviceName }),
  });
  const body = (await res.json()) as { deviceToken?: string };
  if (!res.ok || !body.deviceToken) {
    throw new Error(`Pairing failed: ${res.status} ${JSON.stringify(body)}`);
  }
  return body.deviceToken;
}
