import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ConnectionMode } from "@omp-console/protocol";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface Config {
  name: string;
  host: string;
  port: number;
  dataDir: string;
  insecureHttp: boolean;
  connectionMode: ConnectionMode;
  publicUrl: string | null;
  pairingCode: string | null;
  pairingCodeTtlMs: number;
  heartbeatMs: number;
  logLevel: LogLevel;
  maxBodyBytes: number;
  maxBufferedBytes: number;
  rateLimit: { windowMs: number; max: number };
  /** Absolute path to the persisted state file. */
  storePath: string;
}

export class ConfigError extends Error {}

const LOG_LEVELS: readonly LogLevel[] = ["debug", "info", "warn", "error"];

const CONNECTION_MODES: readonly ConnectionMode[] = [
  "https_domain",
  "https_ip",
  "https_private",
  "http",
];

type FileConfig = Partial<Omit<Config, "rateLimit">> & {
  rateLimit?: Partial<Config["rateLimit"]>;
};

function defaultDataDir(): string {
  const xdg = process.env["XDG_DATA_HOME"];
  if (xdg && xdg.length > 0) {
    return join(xdg, "omp-console");
  }
  return join(homedir(), ".local", "share", "omp-console");
}

export function isLoopbackHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (h.length === 0) return true; // unset host binds loopback by node default
  return (
    h === "localhost" ||
    h === "::1" ||
    h === "0:0:0:0:0:0:0:1" ||
    h === "127.0.0.1" ||
    h.startsWith("127.")
  );
}

function parseBool(value: string): boolean {
  return value === "1" || value.toLowerCase() === "true" || value.toLowerCase() === "yes";
}

function parseIntStrict(value: string, field: string): number {
  const n = Number(value);
  if (!Number.isInteger(n)) {
    throw new ConfigError(`${field} must be an integer, got "${value}"`);
  }
  return n;
}

export function loadConfig(): Config {
  const dataDir = process.env["OMP_CONSOLE_DATA_DIR"] ?? defaultDataDir();
  const configPath =
    process.env["OMP_CONSOLE_CONFIG"] ?? join(dataDir, "config.json");

  let file: FileConfig = {};
  if (existsSync(configPath)) {
    try {
      file = JSON.parse(readFileSync(configPath, "utf8")) as FileConfig;
    } catch (error) {
      throw new ConfigError(
        `Could not parse config file ${configPath}: ${(error as Error).message}`,
      );
    }
  }

  const envPort = process.env["OMP_CONSOLE_PORT"];
  const port =
    envPort !== undefined
      ? parseIntStrict(envPort, "OMP_CONSOLE_PORT")
      : (file.port ?? 8722);

  const envLog = process.env["OMP_CONSOLE_LOG_LEVEL"];
  const logLevel = (envLog ?? file.logLevel ?? "info") as LogLevel;
  if (!LOG_LEVELS.includes(logLevel)) {
    throw new ConfigError(
      `Invalid log level "${logLevel}". Expected one of ${LOG_LEVELS.join(", ")}.`,
    );
  }

  const envMode = process.env["OMP_CONSOLE_CONNECTION_MODE"];
  const connectionMode = (envMode ??
    file.connectionMode ??
    "https_domain") as ConnectionMode;
  if (!CONNECTION_MODES.includes(connectionMode)) {
    throw new ConfigError(
      `Invalid connection mode "${connectionMode}". Expected one of ${CONNECTION_MODES.join(", ")}.`,
    );
  }

  const insecureEnv = process.env["OMP_CONSOLE_INSECURE_HTTP"];

  const config: Config = {
    name: file.name ?? "OMP Console",
    host: process.env["OMP_CONSOLE_HOST"] ?? file.host ?? "127.0.0.1",
    port,
    dataDir,
    insecureHttp: insecureEnv !== undefined ? parseBool(insecureEnv) : (file.insecureHttp ?? false),
    connectionMode,
    publicUrl: process.env["OMP_CONSOLE_PUBLIC_URL"] ?? file.publicUrl ?? null,
    pairingCode: process.env["OMP_CONSOLE_PAIRING_CODE"] ?? file.pairingCode ?? null,
    pairingCodeTtlMs: file.pairingCodeTtlMs ?? 24 * 60 * 60 * 1000,
    heartbeatMs: file.heartbeatMs ?? 15_000,
    logLevel,
    maxBodyBytes: file.maxBodyBytes ?? 64 * 1024,
    maxBufferedBytes: file.maxBufferedBytes ?? 1 * 1024 * 1024,
    rateLimit: {
      windowMs: file.rateLimit?.windowMs ?? 60_000,
      max: file.rateLimit?.max ?? 30,
    },
    storePath: file.storePath ?? join(dataDir, "state.json"),
  };

  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) {
    throw new ConfigError(`Invalid port ${config.port}. Expected 1 to 65535.`);
  }

  if (!isLoopbackHost(config.host) && !config.insecureHttp) {
    throw new ConfigError(
      `Refusing to bind non-loopback host "${config.host}" without TLS. ` +
        `Put a TLS front (Caddy) in front of loopback, or set OMP_CONSOLE_INSECURE_HTTP=1 ` +
        `to serve plain HTTP on purpose. Traffic and credentials would be unencrypted.`,
    );
  }

  return config;
}
