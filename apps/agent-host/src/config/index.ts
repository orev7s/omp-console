/**
 * Agent host configuration. Defaults in code, overridable by environment.
 * The installer writes the env file; there is no config file in this slice.
 */

import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

export type LogLevel = "debug" | "info" | "warn" | "error";
export type ConfinementMode = "unrestricted" | "restricted";

export interface AgentHostConfig {
  /** Path to the `omp` binary. */
  ompBin: string;
  /** Base arguments for every child. Never includes the model. */
  ompArgs: string[];
  /** Optional model selector, for example `kilofree/kilo-auto/free`. */
  ompModel: string | null;
  /** Working directory for the child. Defaults to the requested cwd. */
  ompCwd: string | null;
  /** Per-command timeout, including the prompt acknowledgement. */
  commandTimeoutMs: number;
  /** How long to wait for the `ready` frame after spawn. */
  readyTimeoutMs: number;
  /** Grace period before SIGTERM, then SIGKILL, on shutdown. */
  shutdownGraceMs: number;
  /** Socket, lock, and child registry directory. */
  runtimeDir: string;
  socketPath: string;
  lockPath: string;
  childStatePath: string;
  /** Durable session index and per-session home directories. */
  sessionsRoot: string;
  /** File-system confinement mode for child processes. */
  confinement: ConfinementMode;
  /** Root for restricted workspaces when a caller does not pass a cwd. */
  workspaceRoot: string;
  /** Restart policy before the circuit breaker opens. */
  maxRestarts: number;
  restartBaseMs: number;
  restartMaxMs: number;
  logLevel: LogLevel;
}

const LOG_LEVELS: readonly LogLevel[] = ["debug", "info", "warn", "error"];

function positiveInt(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function isLogLevel(value: string | undefined): value is LogLevel {
  return value !== undefined && (LOG_LEVELS as readonly string[]).includes(value);
}

function confinement(value: string | undefined): ConfinementMode {
  return value === "restricted" ? "restricted" : "unrestricted";
}

export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
): AgentHostConfig {
  const runtimeDir =
    env["OMP_AGENT_HOST_RUNTIME_DIR"] ??
    join(tmpdir(), "omp-console-agent-host");
  const dataDir =
    env["OMP_AGENT_HOST_DATA_DIR"] ??
    join(homedir(), ".local", "share", "omp-console");

  return {
    ompBin: env["OMP_AGENT_HOST_BIN"] ?? "omp",
    ompArgs: ["--mode", "rpc", "--no-ui"],
    ompModel: env["OMP_AGENT_HOST_MODEL"] ?? null,
    ompCwd: env["OMP_AGENT_HOST_CWD"] ?? null,
    commandTimeoutMs: positiveInt(
      env["OMP_AGENT_HOST_COMMAND_TIMEOUT_MS"],
      120_000,
    ),
    readyTimeoutMs: positiveInt(env["OMP_AGENT_HOST_READY_TIMEOUT_MS"], 30_000),
    shutdownGraceMs: positiveInt(
      env["OMP_AGENT_HOST_SHUTDOWN_GRACE_MS"],
      5_000,
    ),
    runtimeDir,
    socketPath:
      env["OMP_AGENT_HOST_SOCKET"] ?? join(runtimeDir, "agent-host.sock"),
    lockPath: env["OMP_AGENT_HOST_LOCK"] ?? join(runtimeDir, "agent-host.lock"),
    childStatePath:
      env["OMP_AGENT_HOST_CHILD_STATE"] ??
      join(runtimeDir, "children.json"),
    sessionsRoot:
      env["OMP_AGENT_HOST_SESSIONS_DIR"] ?? join(dataDir, "sessions"),
    confinement: confinement(env["OMP_AGENT_HOST_CONFINEMENT"]),
    workspaceRoot:
      env["OMP_AGENT_HOST_WORKSPACE_ROOT"] ?? join(homedir(), "omp-workspaces"),
    maxRestarts: positiveInt(env["OMP_AGENT_HOST_MAX_RESTARTS"], 5),
    restartBaseMs: positiveInt(env["OMP_AGENT_HOST_RESTART_BASE_MS"], 500),
    restartMaxMs: positiveInt(env["OMP_AGENT_HOST_RESTART_MAX_MS"], 30_000),
    logLevel: isLogLevel(env["OMP_AGENT_HOST_LOG_LEVEL"])
      ? env["OMP_AGENT_HOST_LOG_LEVEL"]
      : "info",
  };
}