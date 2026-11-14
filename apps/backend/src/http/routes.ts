import { stat } from "node:fs/promises";
import { basename, resolve } from "node:path";
import {
  API_VERSION,
  AddProjectRequestSchema,
  ApiErrorResponseSchema,
  CreateSessionRequestSchema,
  FollowUpRequestSchema,
  PRODUCT_NAME,
  PairRequestSchema,
  PromptRequestSchema,
  RenameDeviceRequestSchema,
  SOFTWARE_VERSION,
  SetModelRequestSchema,
  SetThinkingRequestSchema,
  SteerRequestSchema,
  WS_PROTOCOL_VERSION,
  type AbortResponse,
  type AcceptedResponse,
  type AddProjectResponse,
  type CreateSessionResponse,
  type DeviceListResponse,
  type HealthResponse,
  type MetaResponse,
  type MessagesResponse,
  type PairResponse,
  type Project,
  type ProjectListResponse,
  type PromptResponse,
  type RemoveProjectResponse,
  type RotateTokenResponse,
  type SessionDetailResponse,
  type SessionListResponse,
  type SessionModelsResponse,
  type SessionStatsResponse,
} from "@omp-console/protocol";
import type { CreateSessionPayload } from "@omp-console/agent-protocol";
import { AuthError } from "../auth/index.js";
import type { ProjectRecord } from "../store/index.js";
import { randomId } from "../util/id.js";
import { nowIso } from "../util/time.js";
import { toL1Message } from "../sessions/events.js";
import { HttpError } from "./errors.js";
import { Router, type RequestContext, type RouteResult } from "./router.js";

async function health(ctx: RequestContext): Promise<RouteResult> {
  const body: HealthResponse = {
    status: "ok",
    name: ctx.config.name,
    version: SOFTWARE_VERSION,
    apiVersion: API_VERSION,
    time: nowIso(),
  };
  return { status: 200, body };
}

async function meta(ctx: RequestContext): Promise<RouteResult> {
  const device = ctx.device;
  if (!device) throw HttpError.unauthorized("Authentication required.");
  const agentHostState = ctx.agent.agentStatus?.state ?? "unavailable";
  const body: MetaResponse = {
    serverId: ctx.store.data.serverId,
    name: ctx.config.name,
    version: SOFTWARE_VERSION,
    apiVersion: API_VERSION,
    wsProtocolVersion: WS_PROTOCOL_VERSION,
    agentState: agentHostState === "failed" ? "crashed" : agentHostState,
    ompVersion: ctx.agent.ompVersion,
    connectionMode: ctx.config.connectionMode,
    capabilities: {
      agentHost: ctx.agent.isConnected,
      monitoring: false,
    },
    time: nowIso(),
  };
  return { status: 200, body };
}

async function pair(ctx: RequestContext): Promise<RouteResult> {
  const parsed = PairRequestSchema.safeParse(ctx.body);
  if (!parsed.success) {
    throw HttpError.badRequest("Invalid pairing request.", parsed.error.flatten());
  }
  try {
    const response: PairResponse = await ctx.auth.pair(parsed.data, ctx.remote);
    return { status: 200, body: response };
  } catch (error) {
    if (error instanceof AuthError) {
      throw new HttpError(error.status, error.code as never, error.message, undefined, error.retryable);
    }
    throw error;
  }
}

function deviceList(ctx: RequestContext): DeviceListResponse {
  return { devices: ctx.auth.listDevices(ctx.device?.id) };
}

async function listDevices(ctx: RequestContext): Promise<RouteResult> {
  return { status: 200, body: deviceList(ctx) };
}

async function renameDevice(ctx: RequestContext): Promise<RouteResult> {
  const parsed = RenameDeviceRequestSchema.safeParse(ctx.body);
  if (!parsed.success) {
    throw HttpError.badRequest("Invalid rename request.", parsed.error.flatten());
  }
  const id = ctx.params["id"];
  if (!id) throw HttpError.badRequest("Missing device id.");
  const ok = await ctx.auth.renameDevice(id, parsed.data.name);
  if (!ok) throw HttpError.notFound("No such device.");
  return { status: 200, body: deviceList(ctx) };
}

async function revokeDevice(ctx: RequestContext): Promise<RouteResult> {
  const id = ctx.params["id"];
  if (!id) throw HttpError.badRequest("Missing device id.");
  const ok = await ctx.auth.revokeDevice(id);
  if (!ok) throw HttpError.notFound("No such device.");
  // Close any live sockets for this device now; the next reconnect is refused
  // by `authenticate` because the device is revoked.
  ctx.hub.disconnectDevice(id, "device revoked");
  return { status: 200, body: deviceList(ctx) };
}

async function rotateDevice(ctx: RequestContext): Promise<RouteResult> {
  const id = ctx.params["id"];
  if (!id) throw HttpError.badRequest("Missing device id.");
  const rotated = await ctx.auth.rotateToken(id);
  if (!rotated) throw HttpError.notFound("No such active device.");
  const body: RotateTokenResponse = {
    deviceId: id,
    deviceToken: rotated.token,
    tokenExpiresAt: rotated.tokenExpiresAt,
  };
  return { status: 200, body };
}

/** The agent host is required for this action; 503 when it is not connected. */
function requireAgent(ctx: RequestContext) {
  if (!ctx.agent.isConnected) throw HttpError.agentUnavailable();
  return ctx.agent;
}

const DEFAULT_MESSAGE_LIMIT = 100;
const MAX_MESSAGE_LIMIT = 500;

/** The `limit` query param: an integer in [1, 500], defaulting when absent. */
function parseMessageLimit(raw: string | null): number {
  if (raw === null) return DEFAULT_MESSAGE_LIMIT;
  if (!/^\d+$/.test(raw)) {
    throw HttpError.badRequest("Query parameter limit must be a positive integer.");
  }
  const value = Number.parseInt(raw, 10);
  if (value < 1 || value > MAX_MESSAGE_LIMIT) {
    throw HttpError.badRequest(
      `Query parameter limit must be between 1 and ${MAX_MESSAGE_LIMIT}.`,
    );
  }
  return value;
}

/** The opaque `cursor` query param: an offset into the transcript. */
function parseMessageCursor(raw: string | null): number {
  if (raw === null) return 0;
  if (!/^\d+$/.test(raw)) {
    throw HttpError.badRequest("Query parameter cursor is not a valid cursor.");
  }
  return Number.parseInt(raw, 10);
}

function projectToL1(record: ProjectRecord): Project {
  return { id: record.id, name: record.name, path: record.path };
}

async function listProjects(ctx: RequestContext): Promise<RouteResult> {
  const body: ProjectListResponse = {
    projects: ctx.store.data.projects.map(projectToL1),
  };
  return { status: 200, body };
}

async function addProject(ctx: RequestContext): Promise<RouteResult> {
  const parsed = AddProjectRequestSchema.safeParse(ctx.body);
  if (!parsed.success) {
    throw HttpError.badRequest("Invalid project request.", parsed.error.flatten());
  }
  const path = resolve(parsed.data.path);
  let info;
  try {
    info = await stat(path);
  } catch {
    throw HttpError.badRequest(`No such directory: ${path}`);
  }
  if (!info.isDirectory()) throw HttpError.badRequest(`Not a directory: ${path}`);

  const existing = ctx.store.data.projects.find((project) => project.path === path);
  if (existing) {
    const body: AddProjectResponse = { project: projectToL1(existing) };
    return { status: 200, body };
  }

  const record: ProjectRecord = {
    id: randomId(9),
    name: parsed.data.name?.trim() || basename(path) || path,
    path,
    createdAt: nowIso(),
  };
  await ctx.store.update((state) => {
    state.projects.push(record);
  });
  const body: AddProjectResponse = { project: projectToL1(record) };
  return { status: 201, body };
}

async function removeProject(ctx: RequestContext): Promise<RouteResult> {
  const id = ctx.params["id"];
  if (!id) throw HttpError.badRequest("Missing project id.");
  const exists = ctx.store.data.projects.some((project) => project.id === id);
  if (!exists) throw HttpError.notFound("No such project.");
  await ctx.store.update((state) => {
    state.projects = state.projects.filter((project) => project.id !== id);
  });
  const body: RemoveProjectResponse = { removed: true };
  return { status: 200, body };
}

async function listSessions(ctx: RequestContext): Promise<RouteResult> {
  const body: SessionListResponse = { sessions: ctx.registry.list() };
  return { status: 200, body };
}

async function createSession(ctx: RequestContext): Promise<RouteResult> {
  const parsed = CreateSessionRequestSchema.safeParse(ctx.body ?? {});
  if (!parsed.success) {
    throw HttpError.badRequest("Invalid session request.", parsed.error.flatten());
  }
  const agent = requireAgent(ctx);

  let cwd = parsed.data.cwd;
  if (parsed.data.projectId !== undefined) {
    const project = ctx.store.data.projects.find(
      (candidate) => candidate.id === parsed.data.projectId,
    );
    if (!project) throw HttpError.notFound("No such project.");
    cwd = project.path;
  }

  const payload: CreateSessionPayload = {
    ...(cwd !== undefined ? { cwd } : {}),
    ...(parsed.data.model !== undefined ? { model: parsed.data.model } : {}),
    ...(parsed.data.thinkingLevel !== undefined
      ? { thinkingLevel: parsed.data.thinkingLevel }
      : {}),
  };

  let info;
  try {
    info = await agent.createSession(payload);
  } catch {
    throw HttpError.agentUnavailable();
  }

  const session = ctx.registry.upsertFromInfo(info, parsed.data.name);
  void agent.subscribeSessions([info.id]).catch((error: unknown) => {
    ctx.log.warn("Failed to subscribe to a new session.", {
      sessionId: info.id,
      error: String(error),
    });
  });

  const body: CreateSessionResponse = { session };
  return { status: 201, body };
}

async function getSession(ctx: RequestContext): Promise<RouteResult> {
  const id = ctx.params["id"];
  if (!id) throw HttpError.badRequest("Missing session id.");
  const session = ctx.registry.get(id);
  if (!session) throw HttpError.notFound("No such session.");
  const body: SessionDetailResponse = { session };
  return { status: 200, body };
}

async function promptSession(ctx: RequestContext): Promise<RouteResult> {
  const id = ctx.params["id"];
  if (!id) throw HttpError.badRequest("Missing session id.");
  const parsed = PromptRequestSchema.safeParse(ctx.body);
  if (!parsed.success) {
    throw HttpError.badRequest("Invalid prompt.", parsed.error.flatten());
  }
  const agent = requireAgent(ctx);
  if (!ctx.registry.get(id)) throw HttpError.notFound("No such session.");
  try {
    await agent.promptSession(id, parsed.data.message);
  } catch {
    throw HttpError.agentUnavailable();
  }
  const body: PromptResponse = { accepted: true };
  return { status: 200, body };
}

async function abortSession(ctx: RequestContext): Promise<RouteResult> {
  const id = ctx.params["id"];
  if (!id) throw HttpError.badRequest("Missing session id.");
  const agent = requireAgent(ctx);
  if (!ctx.registry.get(id)) throw HttpError.notFound("No such session.");
  try {
    await agent.abortSession(id);
  } catch {
    throw HttpError.agentUnavailable();
  }
  const body: AbortResponse = { aborted: true };
  return { status: 200, body };
}

async function sessionModels(ctx: RequestContext): Promise<RouteResult> {
  const id = ctx.params["id"];
  if (!id) throw HttpError.badRequest("Missing session id.");
  const agent = requireAgent(ctx);
  if (!ctx.registry.get(id)) throw HttpError.notFound("No such session.");
  try {
    const models = await agent.availableModels(id);
    const body: SessionModelsResponse = { models };
    return { status: 200, body };
  } catch {
    throw HttpError.agentUnavailable();
  }
}

async function setSessionModel(ctx: RequestContext): Promise<RouteResult> {
  const id = ctx.params["id"];
  if (!id) throw HttpError.badRequest("Missing session id.");
  const parsed = SetModelRequestSchema.safeParse(ctx.body);
  if (!parsed.success) {
    throw HttpError.badRequest("Invalid model request.", parsed.error.flatten());
  }
  const agent = requireAgent(ctx);
  if (!ctx.registry.get(id)) throw HttpError.notFound("No such session.");
  try {
    await agent.setModel(id, parsed.data.model);
  } catch {
    throw HttpError.agentUnavailable();
  }
  ctx.registry.setModel(id, parsed.data.model);
  const body: AcceptedResponse = { accepted: true };
  return { status: 200, body };
}

async function setSessionThinking(ctx: RequestContext): Promise<RouteResult> {
  const id = ctx.params["id"];
  if (!id) throw HttpError.badRequest("Missing session id.");
  const parsed = SetThinkingRequestSchema.safeParse(ctx.body);
  if (!parsed.success) {
    throw HttpError.badRequest(
      "Invalid thinking request.",
      parsed.error.flatten(),
    );
  }
  const agent = requireAgent(ctx);
  if (!ctx.registry.get(id)) throw HttpError.notFound("No such session.");
  try {
    await agent.setThinking(id, parsed.data.thinkingLevel);
  } catch {
    throw HttpError.agentUnavailable();
  }
  ctx.registry.setThinking(id, parsed.data.thinkingLevel);
  const body: AcceptedResponse = { accepted: true };
  return { status: 200, body };
}

async function sessionStats(ctx: RequestContext): Promise<RouteResult> {
  const id = ctx.params["id"];
  if (!id) throw HttpError.badRequest("Missing session id.");
  const agent = requireAgent(ctx);
  if (!ctx.registry.get(id)) throw HttpError.notFound("No such session.");
  try {
    const stats = await agent.stats(id);
    const body: SessionStatsResponse = { stats };
    return { status: 200, body };
  } catch {
    throw HttpError.agentUnavailable();
  }
}

async function steerSession(ctx: RequestContext): Promise<RouteResult> {
  const id = ctx.params["id"];
  if (!id) throw HttpError.badRequest("Missing session id.");
  const parsed = SteerRequestSchema.safeParse(ctx.body);
  if (!parsed.success) {
    throw HttpError.badRequest("Invalid steer request.", parsed.error.flatten());
  }
  const agent = requireAgent(ctx);
  if (!ctx.registry.get(id)) throw HttpError.notFound("No such session.");
  try {
    await agent.steer(id, parsed.data.message);
  } catch {
    throw HttpError.agentUnavailable();
  }
  const body: AcceptedResponse = { accepted: true };
  return { status: 200, body };
}

async function followUpSession(ctx: RequestContext): Promise<RouteResult> {
  const id = ctx.params["id"];
  if (!id) throw HttpError.badRequest("Missing session id.");
  const parsed = FollowUpRequestSchema.safeParse(ctx.body);
  if (!parsed.success) {
    throw HttpError.badRequest(
      "Invalid follow-up request.",
      parsed.error.flatten(),
    );
  }
  const agent = requireAgent(ctx);
  if (!ctx.registry.get(id)) throw HttpError.notFound("No such session.");
  try {
    await agent.followUp(id, parsed.data.message);
  } catch {
    throw HttpError.agentUnavailable();
  }
  const body: AcceptedResponse = { accepted: true };
  return { status: 200, body };
}

async function sessionMessages(ctx: RequestContext): Promise<RouteResult> {
  const id = ctx.params["id"];
  if (!id) throw HttpError.badRequest("Missing session id.");
  const session = ctx.registry.get(id);
  if (!session) throw HttpError.notFound("No such session.");

  const cursor = parseMessageCursor(ctx.url.searchParams.get("cursor"));
  const limit = parseMessageLimit(ctx.url.searchParams.get("limit"));

  let messages = ctx.registry.transcript(id);
  if (messages.length === 0 && ctx.agent.isConnected) {
    try {
      const backfill = await ctx.agent.sessionMessages(id);
      ctx.registry.appendBackfill(id, backfill.map(toL1Message));
      messages = ctx.registry.transcript(id);
    } catch {
      // Backfill is best effort; return whatever the registry already has.
    }
  }

  const page = messages.slice(cursor, cursor + limit);
  const nextOffset = cursor + page.length;
  const nextCursor = nextOffset < messages.length ? String(nextOffset) : null;
  const body: MessagesResponse = { messages: page, nextCursor };
  return { status: 200, body };
}

/** Build the control-plane route table. */
export function buildRouter(): Router {
  const router = new Router();
  router.add("GET", "/v1/health", { requireAuth: false }, health);
  router.add("GET", "/v1/meta", { requireAuth: true, scope: "read" }, meta);
  router.add("POST", "/v1/pair", { requireAuth: false, rateLimit: "pairing" }, pair);
  router.add("GET", "/v1/devices", { requireAuth: true, scope: "manage" }, listDevices);
  router.add("PATCH", "/v1/devices/:id", { requireAuth: true, scope: "manage" }, renameDevice);
  router.add("DELETE", "/v1/devices/:id", { requireAuth: true, scope: "manage" }, revokeDevice);
  router.add("POST", "/v1/devices/:id/rotate", { requireAuth: true, scope: "manage" }, rotateDevice);
  router.add("GET", "/v1/projects", { requireAuth: true, scope: "read" }, listProjects);
  router.add("POST", "/v1/projects", { requireAuth: true, scope: "manage" }, addProject);
  router.add("DELETE", "/v1/projects/:id", { requireAuth: true, scope: "manage" }, removeProject);
  router.add("GET", "/v1/sessions", { requireAuth: true, scope: "read" }, listSessions);
  router.add("POST", "/v1/sessions", { requireAuth: true, scope: "agent" }, createSession);
  router.add("GET", "/v1/sessions/:id", { requireAuth: true, scope: "read" }, getSession);
  router.add("POST", "/v1/sessions/:id/prompt", { requireAuth: true, scope: "agent" }, promptSession);
  router.add("POST", "/v1/sessions/:id/abort", { requireAuth: true, scope: "agent" }, abortSession);
  router.add("GET", "/v1/sessions/:id/models", { requireAuth: true, scope: "read" }, sessionModels);
  router.add("POST", "/v1/sessions/:id/model", { requireAuth: true, scope: "agent" }, setSessionModel);
  router.add("POST", "/v1/sessions/:id/thinking", { requireAuth: true, scope: "agent" }, setSessionThinking);
  router.add("GET", "/v1/sessions/:id/stats", { requireAuth: true, scope: "read" }, sessionStats);
  router.add("POST", "/v1/sessions/:id/steer", { requireAuth: true, scope: "agent" }, steerSession);
  router.add("POST", "/v1/sessions/:id/follow-up", { requireAuth: true, scope: "agent" }, followUpSession);
  router.add("GET", "/v1/sessions/:id/messages", { requireAuth: true, scope: "read" }, sessionMessages);
  return router;
}

export { ApiErrorResponseSchema, PRODUCT_NAME };
