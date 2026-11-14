import { loadConfig } from "./config/index.js";
import { createLogger } from "./log/index.js";
import { assertSandboxAvailable } from "./sandbox/index.js";
import { InstanceLock } from "./supervisor/lock.js";
import {
  RuntimeState,
  reconcileOrphans,
} from "./supervisor/runtime-state.js";
import { SessionManager } from "./sessions/manager.js";
import { L2Server } from "./server/l2.js";

/**
 * Agent host process entry. It owns the L2 socket and every `omp` child.
 * Children start lazily on the first session request, so a boot with no work
 * spawns nothing.
 */
async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config.logLevel);

  assertSandboxAvailable(config.confinement);

  const lock = new InstanceLock(config.lockPath);
  await lock.acquire();

  const runtimeState = new RuntimeState(config.childStatePath);
  await reconcileOrphans(await runtimeState.load(), logger);
  await runtimeState.clear();

  let server: L2Server | null = null;
  const manager = new SessionManager({
    config,
    logger,
    runtimeState,
    onEvent: (event) => server?.broadcast(event),
  });
  await manager.init();

  server = new L2Server({
    socketPath: config.socketPath,
    manager,
    logger,
  });
  await server.listen();

  logger.info("agent host started", {
    pid: process.pid,
    socket: config.socketPath,
    confinement: config.confinement,
    ompVersion: (await manager.capabilities()).ompVersion,
  });

  let closing = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (closing) return;
    closing = true;
    logger.info("agent host shutting down", { signal });
    await server?.close();
    await manager.shutdown();
    await lock.release();
    process.exit(0);
  };

  process.once("SIGTERM", () => void shutdown("SIGTERM"));
  process.once("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((error: unknown) => {
  process.stderr.write(
    `agent host failed to start: ${
      error instanceof Error ? error.message : String(error)
    }\n`,
  );
  process.exit(1);
});