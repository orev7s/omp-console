import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RpcClient } from "../src/rpc/index.js";

/**
 * Real-process integration test. It spawns the installed `omp` binary and
 * drives one prompt through the real RPC transport.
 *
 * The default model is a keyless Kilo AI Gateway model, configured on the dev
 * host in ~/.omp/agent/models.yml as provider `kilofree`. Override with
 * OMP_TEST_MODEL, and OMP_TEST_BIN for a different binary. Set
 * OMP_AGENT_HOST_E2E=0 to skip (for example on a host with no network).
 */
const MODEL = process.env["OMP_TEST_MODEL"] ?? "kilofree/kilo-auto/free";
const BIN = process.env["OMP_TEST_BIN"] ?? "omp";
const E2E = process.env["OMP_AGENT_HOST_E2E"] !== "0";

test(
  "real omp over RPC: ready, prompt, settle, clean exit",
  { skip: !E2E, timeout: 300_000 },
  async () => {
    const cwd = await mkdtemp(join(tmpdir(), "omp-agent-host-"));
    const client = new RpcClient({
      binPath: BIN,
      args: ["--mode", "rpc", "--no-session", "--model", MODEL],
      cwd,
      commandTimeoutMs: 180_000,
      readyTimeoutMs: 60_000,
      shutdownGraceMs: 10_000,
    });

    const seen: string[] = [];
    client.onEvent((frame) => {
      seen.push(frame.type);
    });

    try {
      const ready = await client.start();
      assert.ok(ready.protocolVersion >= 1);
      assert.ok(ready.supportedProtocolVersions.includes(1));
      assert.ok(ready.maxFrameBytes > 0);
      assert.ok(ready.maxReassembledFrameBytes >= ready.maxFrameBytes);

      const state = await client.getState();
      assert.equal(state.success, true);

      const agentEnd = client.waitForEvent("agent_end", 240_000);
      const promptResult = client.waitForEvent("prompt_result", 240_000);

      const ack = await client.prompt(
        "Reply with the single word READY and nothing else.",
      );
      assert.equal(ack.success, true);

      const end = await agentEnd;
      assert.notEqual(end["isTerminal"], false);

      const result = await promptResult;
      assert.equal(result["agentInvoked"], true);
      assert.equal(typeof result["status"], "string");
      assert.ok(seen.includes("agent_start"), "expected an agent_start event");
    } finally {
      const exit = await client.close();
      assert.equal(exit.code, 0, `omp exited with ${exit.code}`);
      await rm(cwd, { recursive: true, force: true });
    }
  },
);