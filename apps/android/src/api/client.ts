import {
  AbortResponseSchema,
  AcceptedResponseSchema,
  AddProjectRequestSchema,
  AddProjectResponseSchema,
  CreateSessionRequestSchema,
  CreateSessionResponseSchema,
  DeviceListResponseSchema,
  FollowUpRequestSchema,
  HealthResponseSchema,
  MessagesResponseSchema,
  MetaResponseSchema,
  PairResponseSchema,
  ProjectListResponseSchema,
  PromptRequestSchema,
  PromptResponseSchema,
  RemoveProjectResponseSchema,
  RotateTokenResponseSchema,
  SessionDetailResponseSchema,
  SessionListResponseSchema,
  SessionModelsResponseSchema,
  SessionStatsResponseSchema,
  SetModelRequestSchema,
  SetThinkingRequestSchema,
  SteerRequestSchema,
  type AbortResponse,
  type AcceptedResponse,
  type AddProjectResponse,
  type CreateSessionRequest,
  type CreateSessionResponse,
  type DeviceListResponse,
  type HealthResponse,
  type MessagesResponse,
  type MetaResponse,
  type PairResponse,
  type ProjectListResponse,
  type PromptResponse,
  type RemoveProjectResponse,
  type RotateTokenResponse,
  type SessionDetailResponse,
  type SessionListResponse,
  type SessionModelsResponse,
  type SessionStatsResponse,
} from '@omp-console/protocol';
import type { ServerUrls } from './url';

/** Query for a transcript page. `limit` bounds the page size; `cursor` reads older pages. */
export interface MessagesQuery {
  cursor?: string;
  limit?: number;
}

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

  async devices(token: string, timeoutMs = 8000): Promise<DeviceListResponse> {
    const res = await this.fetchWithTimeout(
      `${this.urls.http}/v1/devices`,
      { headers: { authorization: `Bearer ${token}` } },
      timeoutMs,
    );
    if (!res.ok) throw await toApiError(res);
    return parse(res, DeviceListResponseSchema);
  }

  async renameDevice(
    token: string,
    id: string,
    name: string,
    timeoutMs = 8000,
  ): Promise<DeviceListResponse> {
    const res = await this.fetchWithTimeout(
      `${this.urls.http}/v1/devices/${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name }),
      },
      timeoutMs,
    );
    if (!res.ok) throw await toApiError(res);
    return parse(res, DeviceListResponseSchema);
  }

  async revokeDevice(token: string, id: string, timeoutMs = 8000): Promise<DeviceListResponse> {
    const res = await this.fetchWithTimeout(
      `${this.urls.http}/v1/devices/${encodeURIComponent(id)}`,
      {
        method: 'DELETE',
        headers: { authorization: `Bearer ${token}` },
      },
      timeoutMs,
    );
    if (!res.ok) throw await toApiError(res);
    return parse(res, DeviceListResponseSchema);
  }

  async rotateDevice(token: string, id: string, timeoutMs = 8000): Promise<RotateTokenResponse> {
    const res = await this.fetchWithTimeout(
      `${this.urls.http}/v1/devices/${encodeURIComponent(id)}/rotate`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
      },
      timeoutMs,
    );
    if (!res.ok) throw await toApiError(res);
    return parse(res, RotateTokenResponseSchema);
  }

  async projects(token: string, timeoutMs = 8000): Promise<ProjectListResponse> {
    const res = await this.fetchWithTimeout(
      `${this.urls.http}/v1/projects`,
      { headers: this.auth(token) },
      timeoutMs,
    );
    if (!res.ok) throw await toApiError(res);
    return parse(res, ProjectListResponseSchema);
  }

  async addProject(
    token: string,
    path: string,
    name?: string,
    timeoutMs = 8000,
  ): Promise<AddProjectResponse> {
    const body = AddProjectRequestSchema.parse({ path, name });
    const res = await this.fetchWithTimeout(
      `${this.urls.http}/v1/projects`,
      { method: 'POST', headers: this.jsonAuth(token), body: JSON.stringify(body) },
      timeoutMs,
    );
    if (!res.ok) throw await toApiError(res);
    return parse(res, AddProjectResponseSchema);
  }

  async removeProject(token: string, id: string, timeoutMs = 8000): Promise<RemoveProjectResponse> {
    const res = await this.fetchWithTimeout(
      `${this.urls.http}/v1/projects/${encodeURIComponent(id)}`,
      { method: 'DELETE', headers: this.auth(token) },
      timeoutMs,
    );
    if (!res.ok) throw await toApiError(res);
    return parse(res, RemoveProjectResponseSchema);
  }

  async sessions(token: string, timeoutMs = 8000): Promise<SessionListResponse> {
    const res = await this.fetchWithTimeout(
      `${this.urls.http}/v1/sessions`,
      { headers: this.auth(token) },
      timeoutMs,
    );
    if (!res.ok) throw await toApiError(res);
    return parse(res, SessionListResponseSchema);
  }

  async createSession(
    token: string,
    input: CreateSessionRequest,
    timeoutMs = 12000,
  ): Promise<CreateSessionResponse> {
    const body = CreateSessionRequestSchema.parse(input);
    const res = await this.fetchWithTimeout(
      `${this.urls.http}/v1/sessions`,
      { method: 'POST', headers: this.jsonAuth(token), body: JSON.stringify(body) },
      timeoutMs,
    );
    if (!res.ok) throw await toApiError(res);
    return parse(res, CreateSessionResponseSchema);
  }

  async session(token: string, id: string, timeoutMs = 8000): Promise<SessionDetailResponse> {
    const res = await this.fetchWithTimeout(
      `${this.urls.http}/v1/sessions/${encodeURIComponent(id)}`,
      { headers: this.auth(token) },
      timeoutMs,
    );
    if (!res.ok) throw await toApiError(res);
    return parse(res, SessionDetailResponseSchema);
  }

  async models(token: string, id: string, timeoutMs = 8000): Promise<SessionModelsResponse> {
    const res = await this.fetchWithTimeout(
      `${this.urls.http}/v1/sessions/${encodeURIComponent(id)}/models`,
      { headers: this.auth(token) },
      timeoutMs,
    );
    if (!res.ok) throw await toApiError(res);
    return parse(res, SessionModelsResponseSchema);
  }

  async setModel(
    token: string,
    id: string,
    model: string,
    timeoutMs = 8000,
  ): Promise<AcceptedResponse> {
    const body = SetModelRequestSchema.parse({ model });
    const res = await this.fetchWithTimeout(
      `${this.urls.http}/v1/sessions/${encodeURIComponent(id)}/model`,
      { method: 'POST', headers: this.jsonAuth(token), body: JSON.stringify(body) },
      timeoutMs,
    );
    if (!res.ok) throw await toApiError(res);
    return parse(res, AcceptedResponseSchema);
  }

  async setThinking(
    token: string,
    id: string,
    level: string,
    timeoutMs = 8000,
  ): Promise<AcceptedResponse> {
    const body = SetThinkingRequestSchema.parse({ thinkingLevel: level });
    const res = await this.fetchWithTimeout(
      `${this.urls.http}/v1/sessions/${encodeURIComponent(id)}/thinking`,
      { method: 'POST', headers: this.jsonAuth(token), body: JSON.stringify(body) },
      timeoutMs,
    );
    if (!res.ok) throw await toApiError(res);
    return parse(res, AcceptedResponseSchema);
  }

  async stats(token: string, id: string, timeoutMs = 8000): Promise<SessionStatsResponse> {
    const res = await this.fetchWithTimeout(
      `${this.urls.http}/v1/sessions/${encodeURIComponent(id)}/stats`,
      { headers: this.auth(token) },
      timeoutMs,
    );
    if (!res.ok) throw await toApiError(res);
    return parse(res, SessionStatsResponseSchema);
  }

  async steer(
    token: string,
    id: string,
    message: string,
    timeoutMs = 12000,
  ): Promise<AcceptedResponse> {
    const body = SteerRequestSchema.parse({ message });
    const res = await this.fetchWithTimeout(
      `${this.urls.http}/v1/sessions/${encodeURIComponent(id)}/steer`,
      { method: 'POST', headers: this.jsonAuth(token), body: JSON.stringify(body) },
      timeoutMs,
    );
    if (!res.ok) throw await toApiError(res);
    return parse(res, AcceptedResponseSchema);
  }

  async followUp(
    token: string,
    id: string,
    message: string,
    timeoutMs = 12000,
  ): Promise<AcceptedResponse> {
    const body = FollowUpRequestSchema.parse({ message });
    const res = await this.fetchWithTimeout(
      `${this.urls.http}/v1/sessions/${encodeURIComponent(id)}/follow-up`,
      { method: 'POST', headers: this.jsonAuth(token), body: JSON.stringify(body) },
      timeoutMs,
    );
    if (!res.ok) throw await toApiError(res);
    return parse(res, AcceptedResponseSchema);
  }

  async prompt(
    token: string,
    id: string,
    message: string,
    timeoutMs = 12000,
  ): Promise<PromptResponse> {
    const body = PromptRequestSchema.parse({ message });
    const res = await this.fetchWithTimeout(
      `${this.urls.http}/v1/sessions/${encodeURIComponent(id)}/prompt`,
      { method: 'POST', headers: this.jsonAuth(token), body: JSON.stringify(body) },
      timeoutMs,
    );
    if (!res.ok) throw await toApiError(res);
    return parse(res, PromptResponseSchema);
  }

  async abort(token: string, id: string, timeoutMs = 8000): Promise<AbortResponse> {
    const res = await this.fetchWithTimeout(
      `${this.urls.http}/v1/sessions/${encodeURIComponent(id)}/abort`,
      { method: 'POST', headers: this.auth(token) },
      timeoutMs,
    );
    if (!res.ok) throw await toApiError(res);
    return parse(res, AbortResponseSchema);
  }

  async messages(
    token: string,
    id: string,
    opts: MessagesQuery = {},
    timeoutMs = 8000,
  ): Promise<MessagesResponse> {
    const params: string[] = [];
    if (opts.cursor) params.push(`cursor=${encodeURIComponent(opts.cursor)}`);
    if (opts.limit !== undefined) params.push(`limit=${encodeURIComponent(String(opts.limit))}`);
    const query = params.length > 0 ? `?${params.join('&')}` : '';
    const res = await this.fetchWithTimeout(
      `${this.urls.http}/v1/sessions/${encodeURIComponent(id)}/messages${query}`,
      { headers: this.auth(token) },
      timeoutMs,
    );
    if (!res.ok) throw await toApiError(res);
    return parse(res, MessagesResponseSchema);
  }

  private auth(token: string): Record<string, string> {
    return { authorization: `Bearer ${token}` };
  }

  private jsonAuth(token: string): Record<string, string> {
    return { 'content-type': 'application/json', authorization: `Bearer ${token}` };
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
