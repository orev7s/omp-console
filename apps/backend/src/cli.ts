import { loadConfig } from "./config/index.js";
import { createLogger } from "./log/index.js";
import { Store } from "./store/index.js";
import { AuthService } from "./auth/index.js";

async function main(): Promise<void> {
  const [command] = process.argv.slice(2);
  const config = loadConfig();
  const log = createLogger(config.logLevel, { svc: "cli" });
  const store = await Store.open(config.storePath);
  const auth = new AuthService(store, config, log);

  switch (command) {
    case "pair": {
      const code = await auth.ensurePairingCode(true);
      process.stdout.write(`${code ?? "(no code issued)"}\n`);
      process.stderr.write(
        "If the control plane is already running, restart it so it reloads the new code: systemctl restart omp-console\n",
      );
      break;
    }
    case "devices": {
      const devices = auth.listDevices();
      if (devices.length === 0) {
        process.stdout.write("No paired devices.\n");
      } else {
        for (const d of devices) {
          const status = d.revokedAt ? "revoked" : "active";
          process.stdout.write(
            `${d.id}\t${d.name}\t${status}\t${d.scopes.join(",")}\t${d.createdAt}\t${d.lastSeenAt ?? "never"}\n`,
          );
        }
      }
      break;
    }
    default: {
      process.stdout.write("Usage: omp-console <pair|devices>\n");
      process.exit(command ? 1 : 0);
    }
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`Fatal: ${(error as Error).message}\n`);
  process.exit(1);
});
