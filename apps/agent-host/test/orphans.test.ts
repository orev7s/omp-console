import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createLogger } from "../src/log/index.js";
import { isAlive } from "../src/supervisor/lock.js";
import { reconcileOrphans } from "../src/supervisor/runtime-state.js";

test("reconcileOrphans kills a leftover process group", { timeout: 20_000 }, async () => {
  const child = spawn("sleep", ["30"], { detached: true, stdio: "ignore" });
  const pid = child.pid;
  if (pid === undefined) throw new Error("failed to spawn the fixture process");
  child.unref();

  await delay(100);
  assert.equal(isAlive(pid), true);

  await reconcileOrphans(
    [{ sessionId: "orphan", pid, pgid: pid, sessionDir: "/tmp" }],
    createLogger("error"),
  );

  const deadline = Date.now() + 3_000;
  while (isAlive(pid) && Date.now() < deadline) await delay(100);
  assert.equal(isAlive(pid), false);
});

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}