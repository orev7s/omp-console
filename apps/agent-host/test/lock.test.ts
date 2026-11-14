import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { InstanceLock } from "../src/supervisor/lock.js";

test("a second live instance is refused", async () => {
  const dir = await mkdtemp(join(tmpdir(), "omp-lock-"));
  const path = join(dir, "agent-host.lock");
  const first = new InstanceLock(path);
  await first.acquire();
  const second = new InstanceLock(path);
  await assert.rejects(second.acquire(), /already running/);
  await first.release();
  await rm(dir, { recursive: true, force: true });
});

test("a stale lock whose pid is gone is reclaimed", async () => {
  const dir = await mkdtemp(join(tmpdir(), "omp-lock-"));
  const path = join(dir, "agent-host.lock");
  await writeFile(path, "999999\n", "utf8");
  const lock = new InstanceLock(path);
  await lock.acquire();
  await lock.release();
  await rm(dir, { recursive: true, force: true });
});