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
  "the L2 socket drives a real omp session end to end",
  { skip: !E2E, timeout: 300_000 },
  async () => {
    const dir = await mkdtemp(join(tmpdir(), "omp-l2-"));
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

    const client = new L2TestClient(config.socketPath);
    await client.connect();

    try {
      const status = (await client.request("agent.status")) as {
        state: string;
      };
      assert.equal(status.state, "stopped");

      const session = (await client.request("session.create", {
        cwd: join(dir, "workspace"),
      })) as { id: string; state: string };
      assert.equal(session.state, "ready");

      await client.request("session.subscribe", {
        sessionIds: [session.id],
      });

      const aborted = (await client.request("session.abort", {
        sessionId: session.id,
      })) as { aborted: boolean };
      assert.equal(aborted.aborted, true);

      const started = client.waitFor(
        (event) =>
          event.type === "session.event" &&
          event.sessionId === session.id &&
          event.event.kind === "agent.start",
        240_000,
      );
      const completed = client.waitFor(
        (event) =>
          event.type === "session.event" &&
          event.sessionId === session.id &&
          event.event.kind === "prompt.result",
        240_000,
      );

      const ack = (await client.request("session.prompt", {
        sessionId: session.id,
        message: "Reply with the single word READY and nothing else.",
      })) as { accepted: boolean };
      assert.equal(ack.accepted, true);

      await started;
      const result = await completed;
      assert.equal(result.type, "session.event");

      await client.request("session.close", { sessionId: session.id });
      const after = (await client.request("agent.status")) as {
        sessions: { state: string }[];
      };
      assert.equal(after.sessions[0]?.state, "stopped");
    } finally {
      client.close();
      await server.close();
      await manager.shutdown();
      await rm(dir, { recursive: true, force: true });
    }
  },
);