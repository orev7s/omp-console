import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assertSandboxAvailable,
  buildSpawnCommand,
} from "../src/sandbox/index.js";

const OMP_BIN = process.env["OMP_TEST_BIN"] ?? "/usr/local/bin/omp";

test(
  "restricted mode runs the real omp binary inside bubblewrap",
  { timeout: 30_000 },
  async () => {
    assertSandboxAvailable("restricted");
    const home = await mkdtemp(join(tmpdir(), "omp-sandbox-"));
    const command = buildSpawnCommand({
      mode: "restricted",
      ompBin: OMP_BIN,
      ompArgs: ["--version"],
      workspace: home,
      homeDir: home,
    });
    assert.equal(command.bin, "bwrap");

    const result = await run(command.bin, command.args, { HOME: home });
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /omp\//);
    await rm(home, { recursive: true, force: true });
  },
);

function run(
  bin: string,
  args: string[],
  env: NodeJS.ProcessEnv,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(bin, args, {
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    child.on("error", (error) => resolve({ code: null, stdout, stderr: error.message }));
  });
}