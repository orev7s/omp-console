import {
  HealthResponseSchema,
  MetaResponseSchema,
  PairResponseSchema,
  type HealthResponse,
  type MetaResponse,
  type PairResponse,
} from '@omp-console/protocol';
import type { ServerUrls } from './url';

/** Error carrying the server's stable error code when available. */
export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function toApiError(res: Response): Promise<ApiError> {
  let code = 'internal';
  let message = `Request failed (HTTP ${res.status}).`;
  let retryable = res.status >= 500;
  try {
    const body = (await res.json()) as {
      error?: { code?: string; message?: string; retryable?: boolean };
    };
    if (body.error) {
      code = body.error.code ?? code;
      message = body.error.message ?? message;
      retryable = body.error.retryable ?? retryable;
    }
  } catch {
    // Non-JSON error body; keep the defaults.
  }
  return new ApiError(code, message, res.status, retryable);
}

async function parse<T>(res: Response, schema: { parse: (v: unknown) => T }): Promise<T> {
  const json = await res.json();
  return schema.parse(json);
}

export class ApiClient {
  constructor(private readonly urls: ServerUrls) {}

  async health(timeoutMs = 8000): Promise<HealthResponse> {
    const res = await this.fetchWithTimeout(`${this.urls.http}/v1/health`, {}, timeoutMs);
    if (!res.ok) throw await toApiError(res);
    return parse(res, HealthResponseSchema);
  }

  async meta(token: string, timeoutMs = 8000): Promise<MetaResponse> {
    const res = await this.fetchWithTimeout(
      `${this.urls.http}/v1/meta`,
      { headers: { authorization: `Bearer ${token}` } },
      timeoutMs,
    );
    if (!res.ok) throw await toApiError(res);
    return parse(res, MetaResponseSchema);
  }

  async pair(code: string, deviceName: string, timeoutMs = 12000): Promise<PairResponse> {
    const res = await this.fetchWithTimeout(
      `${this.urls.http}/v1/pair`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code, deviceName }),
      },
      timeoutMs,
    );
    if (!res.ok) throw await toApiError(res);
    return parse(res, PairResponseSchema);
  }

  private async fetchWithTimeout(
    url: string,
    init: RequestInit,
    timeoutMs: number,
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }
}
