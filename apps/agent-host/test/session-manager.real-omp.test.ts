import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../src/config/index.js";
import { createLogger } from "../src/log/index.js";
import { SessionManager } from "../src/sessions/manager.js";
import { RuntimeState } from "../src/supervisor/runtime-state.js";

const MODEL = process.env["OMP_TEST_MODEL"] ?? "kilofree/kilo-auto/free";
const E2E = process.env["OMP_AGENT_HOST_E2E"] !== "0";

test(
  "a real session starts, restarts after a kill, and closes cleanly",
  { skip: !E2E, timeout: 120_000 },
  async () => {
    const dir = await mkdtemp(join(tmpdir(), "omp-manager-"));
    const config = loadConfig({
      ...process.env,
      OMP_AGENT_HOST_RUNTIME_DIR: dir,
      OMP_AGENT_HOST_DATA_DIR: dir,
      OMP_AGENT_HOST_SESSIONS_DIR: join(dir, "sessions"),
      OMP_AGENT_HOST_MODEL: MODEL,
      OMP_AGENT_HOST_CONFINEMENT: "unrestricted",
      OMP_AGENT_HOST_MAX_RESTARTS: "3",
      OMP_AGENT_HOST_RESTART_BASE_MS: "100",
      OMP_AGENT_HOST_RESTART_MAX_MS: "500",
      OMP_AGENT_HOST_LOG_LEVEL: "error",
    });
    const runtimeState = new RuntimeState(config.childStatePath);
    const manager = new SessionManager({
      config,
      logger: createLogger("error"),
      runtimeState,
      onEvent: () => {},
    });

    try {
      await manager.init();
      const info = await manager.create({ cwd: join(dir, "workspace") });
      assert.equal(info.state, "ready");
      assert.equal(info.model, MODEL);

      const first = await runtimeState.load();
      assert.equal(first.length, 1);
      const firstPid = first[0]?.pid;
      assert.ok(typeof firstPid === "number");

      try {
        process.kill(-firstPid, "SIGKILL");
      } catch {
        process.kill(firstPid, "SIGKILL");
      }

      const ready = await waitFor(async () => {
        const current = manager.get(info.id);
        if (current.state !== "ready") return null;
        const records = await runtimeState.load();
        const pid = records[0]?.pid;
        return pid !== undefined && pid !== firstPid ? pid : null;
      }, 30_000);
      assert.ok(typeof ready === "number", "session did not restart");

      await manager.closeSession(info.id);
      assert.equal(manager.get(info.id).state, "stopped");
    } finally {
      await manager.shutdown();
      await rm(dir, { recursive: true, force: true });
    }
  },
);

async function waitFor<T>(
  probe: () => Promise<T | null>,
  timeoutMs: number,
): Promise<T | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await probe();
    if (value !== null) return value;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return null;
}