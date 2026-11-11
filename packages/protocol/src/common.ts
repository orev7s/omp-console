import { z } from "zod";

/**
 * Lifecycle state of the agent runtime as seen by the app. Phase 1 always
 * reports `unavailable` because there is no agent host yet.
 */
export const AgentStateSchema = z.enum([
  "unavailable",
  "stopped",
  "starting",
  "ready",
  "busy",
  "crashed",
]);

export type AgentState = z.infer<typeof AgentStateSchema>;

/**
 * How the app reaches the server. Selected by the user, stored per server.
 * `http` is the explicit, insecure opt-in.
 */
export const ConnectionModeSchema = z.enum([
  "https_domain",
  "https_ip",
  "https_private",
  "http",
]);

export type ConnectionMode = z.infer<typeof ConnectionModeSchema>;

/** RFC 3339 timestamp in UTC, produced by the server. */
export const TimestampSchema = z.string().min(20).max(40);
