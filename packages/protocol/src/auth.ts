import { z } from "zod";
import { TimestampSchema } from "./common.js";

/**
 * Capability a device credential may exercise. `read` covers status and
 * transcripts, `agent` covers prompting and session control, and `manage`
 * covers device administration, pairing, and process or config changes. The
 * dangerous capabilities sit behind `manage` so a stolen phone cannot reach
 * them.
 */
export const ScopeSchema = z.enum(["read", "agent", "manage"]);
export type Scope = z.infer<typeof ScopeSchema>;

export const ALL_SCOPES: readonly Scope[] = ["read", "agent", "manage"] as const;

/** Scopes a freshly paired device receives unless an operator narrows them. */
export const DEFAULT_DEVICE_SCOPES: readonly Scope[] = ["read", "agent", "manage"] as const;

/** True when the given scopes satisfy the required scope. */
export function hasScope(scopes: readonly string[], required: Scope): boolean {
  return scopes.includes(required);
}

/**
 * A paired device as the app and `manage`-scoped callers see it. The token hash
 * never leaves the server; `current` marks the caller's own device so the UI can
 * avoid "revoke me" accidents.
 */
export const DeviceSummarySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  scopes: z.array(ScopeSchema),
  createdAt: TimestampSchema,
  lastSeenAt: TimestampSchema.nullable(),
  tokenExpiresAt: TimestampSchema.nullable(),
  /** When the device was revoked; null while active. */
  revokedAt: TimestampSchema.nullable(),
  current: z.boolean().optional(),
});

export type DeviceSummary = z.infer<typeof DeviceSummarySchema>;

export const DeviceListResponseSchema = z.object({
  devices: z.array(DeviceSummarySchema),
});

export type DeviceListResponse = z.infer<typeof DeviceListResponseSchema>;

export const RenameDeviceRequestSchema = z.object({
  name: z.string().trim().min(1).max(64),
});

export type RenameDeviceRequest = z.infer<typeof RenameDeviceRequestSchema>;

/** Response to a token rotation. The plaintext token is returned exactly once. */
export const RotateTokenResponseSchema = z.object({
  deviceId: z.string().min(1),
  deviceToken: z.string().min(1),
  tokenExpiresAt: TimestampSchema.nullable(),
});

export type RotateTokenResponse = z.infer<typeof RotateTokenResponseSchema>;
