import {
  API_VERSION,
  ApiErrorResponseSchema,
  PairRequestSchema,
  PRODUCT_NAME,
  SOFTWARE_VERSION,
  WS_PROTOCOL_VERSION,
  type HealthResponse,
  type MetaResponse,
  type PairResponse,
} from "@omp-console/protocol";
import { AuthError } from "../auth/index.js";
import { nowIso } from "../util/time.js";
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
  const body: MetaResponse = {
    serverId: ctx.store.data.serverId,
    name: ctx.config.name,
    version: SOFTWARE_VERSION,
    apiVersion: API_VERSION,
    wsProtocolVersion: WS_PROTOCOL_VERSION,
    agentState: "unavailable",
    ompVersion: null,
    connectionMode: ctx.config.connectionMode,
    capabilities: { agentHost: false, monitoring: false },
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

/** Build the Phase 1 route table. */
export function buildRouter(): Router {
  const router = new Router();
  router.add("GET", "/v1/health", { requireAuth: false }, health);
  router.add("GET", "/v1/meta", { requireAuth: true }, meta);
  router.add("POST", "/v1/pair", { requireAuth: false, rateLimit: true }, pair);
  return router;
}

export { ApiErrorResponseSchema, PRODUCT_NAME };
