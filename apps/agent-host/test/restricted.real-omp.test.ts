import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SessionEvent } from "@omp-console/agent-protocol";
import { createLogger } from "../src/log/index.js";
import { SessionManager } from "../src/sessions/manager.js";
import { RuntimeState } from "../src/supervisor/runtime-state.js";
import { integrationConfig } from "./integration-config.js";

const E2E = process.env["OMP_AGENT_HOST_E2E"] !== "0";
const HAS_BWRAP = ["/usr/bin/bwrap", "/bin/bwrap", "/usr/local/bin/bwrap"].some(
  (path) => existsSync(path),
);

test(
  "restricted mode runs a full session inside bubblewrap",
  { skip: !E2E || !HAS_BWRAP, timeout: 300_000 },
  async () => {
    const dir = await mkdtemp(join(tmpdir(), "omp-restricted-"));
    const config = integrationConfig(dir, "restricted");
    const runtimeState = new RuntimeState(config.childStatePath);
    const events: SessionEvent[] = [];
    const manager = new SessionManager({
      config,
      logger: createLogger("error"),
      runtimeState,
      onEvent: (event) => {
        if (event.type === "session.event") events.push(event.event);
      },
    });

    try {
      await manager.init();
      const session = await manager.create({ cwd: join(dir, "workspace") });
      assert.equal(session.state, "ready");

      await manager.prompt(
        session.id,
        "Reply with the single word READY and nothing else.",
      );
      const result = await waitFor(
        () => events.find((event) => event.kind === "prompt.result") ?? null,
        240_000,
      );
      assert.ok(result !== null, "no prompt result from the sandboxed agent");

      await manager.closeSession(session.id);
      assert.equal(manager.get(session.id).state, "stopped");
    } finally {
      await manager.shutdown();
      await rm(dir, { recursive: true, force: true });
    }
  },
);

async function waitFor<T>(
  probe: () => T | null,
  timeoutMs: number,
): Promise<T | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = probe();
    if (value !== null) return value;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return null;
}