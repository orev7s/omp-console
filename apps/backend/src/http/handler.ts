import type { IncomingMessage, ServerResponse } from "node:http";
import { ApiErrorResponseSchema, type ErrorCode } from "@omp-console/protocol";
import type { AuthService } from "../auth/index.js";
import type { RateLimiter } from "../auth/rate-limit.js";
import type { Config } from "../config/index.js";
import type { Logger } from "../log/index.js";
import type { Store } from "../store/index.js";
import { requestId } from "../util/id.js";
import { HttpError } from "./errors.js";
import type { RequestContext, RouteResult, Router } from "./router.js";

export interface HttpHandlerDeps {
  router: Router;
  config: Config;
  log: Logger;
  store: Store;
  auth: AuthService;
  rateLimiter: RateLimiter;
}

function extractBearer(header: string | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1] ?? null;
}

async function readBody(req: IncomingMessage, maxBytes: number): Promise<unknown> {
  const method = (req.method ?? "GET").toUpperCase();
  if (method === "GET" || method === "HEAD") return undefined;

  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = chunk as Buffer;
    total += buf.length;
    if (total > maxBytes) {
      throw HttpError.payloadTooLarge(`Request body exceeds ${maxBytes} bytes.`);
    }
    chunks.push(buf);
  }
  if (total === 0) return undefined;

  const text = Buffer.concat(chunks).toString("utf8");
  try {
    return JSON.parse(text);
  } catch {
    throw HttpError.badRequest("Request body is not valid JSON.");
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = body === undefined ? "" : JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

export function toErrorResponse(error: unknown, log: Logger): { status: number; code: ErrorCode; message: string; details?: unknown; retryable: boolean } {
  if (error instanceof HttpError) {
    return {
      status: error.status,
      code: error.code,
      message: error.message,
      details: error.details,
      retryable: error.retryable,
    };
  }
  const maybe = error as { httpStatus?: number };
  if (maybe.httpStatus === 405) {
    return { status: 405, code: "bad_request", message: "Method not allowed.", retryable: false };
  }
  log.error("Unhandled request error.", { error: String(error), stack: (error as Error)?.stack });
  return { status: 500, code: "internal", message: "Internal server error.", retryable: true };
}

async function handle(
  req: IncomingMessage,
  res: ServerResponse,
  deps: HttpHandlerDeps,
): Promise<void> {
  const id = requestId();
  const url = new URL(req.url ?? "/", "http://localhost");
  const method = (req.method ?? "GET").toUpperCase();
  const remote = req.socket.remoteAddress ?? "unknown";
  const log = deps.log.child({ requestId: id, method, path: url.pathname });
  res.setHeader("x-request-id", id);
  res.setHeader("cache-control", "no-store");

  const started = Date.now();
  try {
    const match = deps.router.match(method, url.pathname);
    if (!match) throw HttpError.notFound("No such endpoint.");

    if (match.route.options.rateLimit) {
      const limited = deps.rateLimiter.consume(`${url.pathname}:${remote}`);
      if (!limited.allowed) {
        throw HttpError.rateLimited(
          "Too many requests. Try again shortly.",
          limited.retryAfterMs,
        );
      }
    }

    let device = null;
    if (match.route.options.requireAuth) {
      const token = extractBearer(req.headers.authorization);
      device = deps.auth.authenticate(token);
      if (!device) throw HttpError.unauthorized("Missing or invalid credentials.");
    }

    const body = await readBody(req, deps.config.maxBodyBytes);
    const ctx: RequestContext = {
      req,
      res,
      method,
      path: url.pathname,
      url,
      requestId: id,
      remote,
      device,
      body,
      log,
      config: deps.config,
      store: deps.store,
      auth: deps.auth,
    };

    const result: RouteResult = await match.route.handler(ctx);
    sendJson(res, result.status, result.body);
    log.debug("Request handled.", { status: result.status, ms: Date.now() - started });
  } catch (error) {
    const mapped = toErrorResponse(error, log);
    const body = ApiErrorResponseSchema.parse({
      error: {
        code: mapped.code,
        message: mapped.message,
        ...(mapped.details !== undefined ? { details: mapped.details } : {}),
        retryable: mapped.retryable,
      },
    });
    sendJson(res, mapped.status, body);
    log.debug("Request rejected.", { status: mapped.status, code: mapped.code });
  }
}

export function createHttpHandler(deps: HttpHandlerDeps): (req: IncomingMessage, res: ServerResponse) => void {
  return (req, res) => {
    void handle(req, res, deps).catch((error: unknown) => {
      deps.log.error("Request pipeline failure.", { error: String(error) });
      if (!res.headersSent) sendJson(res, 500, { error: { code: "internal", message: "Internal server error." } });
      else res.end();
    });
  };
}
