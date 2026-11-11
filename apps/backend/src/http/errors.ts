import type { ErrorCode } from "@omp-console/protocol";

/** An error with an HTTP status and a stable, machine-readable code. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "HttpError";
  }

  static badRequest(message: string, details?: unknown): HttpError {
    return new HttpError(400, "bad_request", message, details);
  }

  static unauthorized(message: string): HttpError {
    return new HttpError(401, "unauthorized", message);
  }

  static forbidden(message: string): HttpError {
    return new HttpError(403, "forbidden", message);
  }

  static notFound(message: string): HttpError {
    return new HttpError(404, "not_found", message);
  }

  static rateLimited(message: string, retryAfterMs: number): HttpError {
    return new HttpError(429, "rate_limited", message, { retryAfterMs }, true);
  }

  static payloadTooLarge(message: string): HttpError {
    return new HttpError(413, "payload_too_large", message);
  }

  static unsupportedVersion(message: string): HttpError {
    return new HttpError(400, "unsupported_version", message);
  }

  static internal(message = "Internal server error."): HttpError {
    return new HttpError(500, "internal", message, undefined, true);
  }
}
