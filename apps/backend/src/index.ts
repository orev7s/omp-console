import { loadConfig, isLoopbackHost } from "./config/index.js";
import { createLogger } from "./log/index.js";
import { Store } from "./store/index.js";
import { AuthService } from "./auth/index.js";
import { createApp } from "./app.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const log = createLogger(config.logLevel, { svc: "control-plane" });

  if (!isLoopbackHost(config.host) && config.insecureHttp) {
    log.warn(
      "Serving plain HTTP on a non-loopback interface. Traffic and credentials are unencrypted and can be intercepted.",
      { host: config.host, port: config.port },
    );
  }

  const store = await Store.open(config.storePath);
  const auth = new AuthService(store, config, log);

  // Mint only when no valid code exists. The installer mints a code before the
  // service starts, and forcing a new one here would invalidate what it printed.
  const code = await auth.ensurePairingCode();
  if (code) {
    // Printed once (and only when a new code is minted) so an operator can pair.
    process.stdout.write(`\nPairing code: ${code}\n\n`);
  }

  const app = createApp({ config, log, store, auth });
  await app.start();

  const { host, port } = app.address();
  log.info("Ready.", { url: `http://${host}:${port}` });

  let shuttingDown = false;
  const shutdown = (signal: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info("Shutting down.", { signal });
    void app
      .stop()
      .then(() => process.exit(0))
      .catch((error: unknown) => {
        log.error("Shutdown failed.", { error: String(error) });
        process.exit(1);
      });
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((error: unknown) => {
  process.stderr.write(`Fatal: ${(error as Error).message}\n`);
  process.exit(1);
});
