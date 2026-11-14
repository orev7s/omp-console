import { join } from "node:path";
import { loadConfig } from "../src/config/index.js";

export const TEST_MODEL =
  process.env["OMP_TEST_MODEL"] ?? "kilofree/kilo-auto/free";

/** Config for a real-omp integration test rooted at a temp directory. */
export function integrationConfig(
  dir: string,
  confinement: "unrestricted" | "restricted" = "unrestricted",
) {
  return loadConfig({
    ...process.env,
    OMP_AGENT_HOST_RUNTIME_DIR: dir,
    OMP_AGENT_HOST_DATA_DIR: dir,
    OMP_AGENT_HOST_SESSIONS_DIR: join(dir, "sessions"),
    OMP_AGENT_HOST_SOCKET: join(dir, "agent-host.sock"),
    OMP_AGENT_HOST_MODEL: TEST_MODEL,
    OMP_AGENT_HOST_CONFINEMENT: confinement,
    OMP_AGENT_HOST_LOG_LEVEL: "error",
  });
}