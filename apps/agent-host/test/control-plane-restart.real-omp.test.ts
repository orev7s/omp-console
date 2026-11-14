import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLogger } from "../src/log/index.js";
import { SessionManager } from "../src/sessions/manager.js";
import { RuntimeState } from "../src/supervisor/runtime-state.js";
import { L2Server } from "../src/server/l2.js";
import { L2TestClient } from "./l2-test-client.js";
import { integrationConfig } from "./integration-config.js";

const E2E = process.env["OMP_AGENT_HOST_E2E"] !== "0";

test(
  "a control-plane reconnect does not restart omp",
  { skip: !E2E, timeout: 120_000 },
  async () => {
    const dir = await mkdtemp(join(tmpdir(), "omp-reconnect-"));
    const config = integrationConfig(dir);
    const logger = createLogger("error");
    const runtimeState = new RuntimeState(config.childStatePath);
    let server: L2Server | null = null;
    const manager = new SessionManager({
      config,
      logger,
      runtimeState,
      onEvent: (event) => server?.broadcast(event),
    });

    await manager.init();
    server = new L2Server({ socketPath: config.socketPath, manager, logger });
    await server.listen();

    try {
      const first = new L2TestClient(config.socketPath);
      await first.connect();
      const session = (await first.request("session.create", {
        cwd: join(dir, "workspace"),
      })) as { id: string };
      const before = (await runtimeState.load())[0]?.pid;
      assert.ok(typeof before === "number");

      // Simulate a control-plane restart: drop the L2 client, open a new one.
      first.close();
      const second = new L2TestClient(config.socketPath);
      await second.connect();
      const status = (await second.request("agent.status")) as {
        sessions: { id: string; state: string }[];
      };
      assert.equal(status.sessions[0]?.id, session.id);
      assert.equal(status.sessions[0]?.state, "ready");

      const after = (await runtimeState.load())[0]?.pid;
      assert.equal(after, before, "omp was restarted by the reconnect");

      second.close();
      await manager.closeSession(session.id);
    } finally {
      await server.close();
      await manager.shutdown();
      await rm(dir, { recursive: true, force: true });
    }
  },
);