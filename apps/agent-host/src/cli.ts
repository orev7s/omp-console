#!/usr/bin/env node
import { loadConfig } from "./config/index.js";
import { createLogger } from "./log/index.js";
import { RpcClient } from "./rpc/index.js";

/**
 * `probe` spawns one real `omp --mode rpc`, waits for ready, asks for its
 * session state, prints both, and shuts the child down cleanly. It is the
 * smallest end-to-end check that the agent host can own a child.
 */
async function probe(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config.logLevel);
  const args = [...config.ompArgs, "--no-session"];
  if (config.ompModel !== null) args.push("--model", config.ompModel);

  const client = new RpcClient({
    binPath: config.ompBin,
    args,
    cwd: config.ompCwd ?? process.cwd(),
    commandTimeoutMs: config.commandTimeoutMs,
    readyTimeoutMs: config.readyTimeoutMs,
    shutdownGraceMs: config.shutdownGraceMs,
    logger,
  });

  try {
    const ready = await client.start();
    const state = await client.getState();
    process.stdout.write(
      JSON.stringify({ ready, state: state.data ?? null }, null, 2) + "\n",
    );
  } finally {
    const exit = await client.close();
    logger.info("omp closed", { code: exit.code, signal: exit.signal });
  }
}

const command = process.argv[2] ?? "probe";
if (command === "probe") {
  probe().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
} else {
  process.stderr.write(
    `unknown command: ${command}\nusage: omp-console-agent-host probe\n`,
  );
  process.exitCode = 2;
}