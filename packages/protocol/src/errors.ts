import { z } from "zod";

/**
 * Known, stable error codes. The wire schema uses a plain string so a newer
 * server can introduce codes without breaking an older client, but these are
 * the codes our own code is allowed to emit.
 */
export const ERROR_CODES = [
  "bad_request",
  "unauthorized",
  "forbidden",
  "not_found",
  "conflict",
  "rate_limited",
  "payload_too_large",
  "unsupported_version",
  "not_implemented",
  "internal",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export const ApiErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  details: z.unknown().optional(),
  retryable: z.boolean().optional(),
});

export const ApiErrorResponseSchema = z.object({
  error: ApiErrorSchema,
});

export type ApiError = z.infer<typeof ApiErrorSchema>;
export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;

export function isRetryableCode(code: ErrorCode): boolean {
  return code === "rate_limited" || code === "internal";
}
