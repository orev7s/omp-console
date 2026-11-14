import { z } from "zod";

/**
 * Agent host state. `failed` means the restart circuit breaker opened; the
 * control plane maps it to its L1 `crashed` until L1 gains the value.
 */
export const AgentStateSchema = z.enum([
  "unavailable",
  "stopped",
  "starting",
  "ready",
  "busy",
  "crashed",
  "failed",
]);

export type AgentState = z.infer<typeof AgentStateSchema>;

/** State of one owned session child. */
export const SessionStateSchema = z.enum([
  "starting",
  "ready",
  "busy",
  "stopped",
  "crashed",
  "failed",
]);

export type SessionState = z.infer<typeof SessionStateSchema>;

export const SessionInfoSchema = z.object({
  id: z.string().min(1),
  /** Display title. Null until the first user message names the session. */
  title: z.string().nullable(),
  cwd: z.string().min(1),
  model: z.string().nullable(),
  thinkingLevel: z.string().nullable(),
  state: SessionStateSchema,
  sessionFile: z.string().nullable(),
  createdAt: z.string().min(1),
  lastError: z.string().nullable(),
});

export type SessionInfo = z.infer<typeof SessionInfoSchema>;

export const AgentStatusSchema = z.object({
  state: AgentStateSchema,
  pid: z.number().int().positive().nullable(),
  uptimeMs: z.number().int().nonnegative(),
  sessions: z.array(SessionInfoSchema),
});

export type AgentStatus = z.infer<typeof AgentStatusSchema>;

export const CapabilitiesSchema = z.object({
  ompVersion: z.string().nullable(),
  protocolVersion: z.number().int().positive(),
  supportedProtocolVersions: z.array(z.number().int().positive()),
  commands: z.array(z.string()),
  loginProviders: z.unknown().nullable(),
});

export type Capabilities = z.infer<typeof CapabilitiesSchema>;

export const L2ErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
});

export type L2Error = z.infer<typeof L2ErrorSchema>;