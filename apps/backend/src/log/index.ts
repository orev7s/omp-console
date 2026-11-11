import type { LogLevel } from "../config/index.js";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

/** Keys whose values must never be written to logs. */
const REDACT_KEYS = new Set(
  [
    "token",
    "devicetoken",
    "authorization",
    "code",
    "pairingcode",
    "secret",
    "devicesecret",
    "bootstrapsecret",
    "codehash",
    "tokenhash",
    "password",
    "cookie",
  ].map((k) => k.toLowerCase()),
);

function redactValue(value: unknown, depth: number): unknown {
  if (depth > 4) return "[depth-limit]";
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => redactValue(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    out[key] = REDACT_KEYS.has(key.toLowerCase())
      ? "[redacted]"
      : redactValue(val, depth + 1);
  }
  return out;
}

export interface Logger {
  debug(message: string, fields?: Record<string, unknown>): void;
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
  child(fields: Record<string, unknown>): Logger;
}

type Sink = (line: string) => void;

function defaultSink(line: string): void {
  process.stderr.write(line + "\n");
}

export function createLogger(
  level: LogLevel,
  base: Record<string, unknown> = {},
  sink: Sink = defaultSink,
): Logger {
  const threshold = LEVEL_ORDER[level];

  function write(
    lvl: LogLevel,
    message: string,
    fields?: Record<string, unknown>,
  ): void {
    if (LEVEL_ORDER[lvl] < threshold) return;
    const record: Record<string, unknown> = {
      ts: new Date().toISOString(),
      level: lvl,
      msg: message,
      ...(redactValue(base, 0) as Record<string, unknown>),
      ...(fields ? (redactValue(fields, 0) as Record<string, unknown>) : {}),
    };
    let line: string;
    try {
      line = JSON.stringify(record);
    } catch {
      line = JSON.stringify({ ts: record["ts"], level: lvl, msg: message, error: "log-serialize-failed" });
    }
    sink(line);
  }

  return {
    debug: (m, f) => write("debug", m, f),
    info: (m, f) => write("info", m, f),
    warn: (m, f) => write("warn", m, f),
    error: (m, f) => write("error", m, f),
    child(fields) {
      return createLogger(level, { ...base, ...fields }, sink);
    },
  };
}
