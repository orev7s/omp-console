import type { IncomingMessage, ServerResponse } from "node:http";
import type { Config } from "../config/index.js";
import type { Logger } from "../log/index.js";
import type { Store } from "../store/index.js";
import type { AuthService } from "../auth/index.js";
import type { DeviceRecord } from "../store/types.js";

export interface RequestContext {
  req: IncomingMessage;
  res: ServerResponse;
  method: string;
  path: string;
  url: URL;
  requestId: string;
  remote: string;
  device: DeviceRecord | null;
  body: unknown;
  log: Logger;
  config: Config;
  store: Store;
  auth: AuthService;
}

export interface RouteResult {
  status: number;
  body?: unknown;
}

export type RouteHandler = (ctx: RequestContext) => Promise<RouteResult> | RouteResult;

export interface RouteOptions {
  requireAuth: boolean;
  /** Apply the shared rate limiter to this route, keyed by remote address. */
  rateLimit?: boolean;
}

export interface Route {
  method: string;
  segments: string[];
  options: RouteOptions;
  handler: RouteHandler;
}

export interface RouteMatch {
  route: Route;
  params: Record<string, string>;
}

function splitPath(path: string): string[] {
  return path.split("/").filter((segment) => segment.length > 0);
}

function isParam(segment: string): boolean {
  return segment.startsWith(":") && segment.length > 1;
}

export class Router {
  private readonly routes: Route[] = [];

  add(
    method: string,
    path: string,
    options: RouteOptions,
    handler: RouteHandler,
  ): void {
    this.routes.push({
      method: method.toUpperCase(),
      segments: splitPath(path),
      options,
      handler,
    });
  }

  match(method: string, path: string): RouteMatch | null {
    const target = splitPath(path);
    let pathMatchedButNotMethod = false;

    for (const route of this.routes) {
      if (route.segments.length !== target.length) continue;

      const params: Record<string, string> = {};
      let matched = true;
      for (let i = 0; i < route.segments.length; i += 1) {
        const routeSegment = route.segments[i] ?? "";
        const targetSegment = target[i] ?? "";
        if (isParam(routeSegment)) {
          params[routeSegment.slice(1)] = decodeURIComponent(targetSegment);
        } else if (routeSegment !== targetSegment) {
          matched = false;
          break;
        }
      }
      if (!matched) continue;

      if (route.method === method.toUpperCase()) {
        return { route, params };
      }
      pathMatchedButNotMethod = true;
    }

    if (pathMatchedButNotMethod) {
      throw Object.assign(new Error("Method not allowed"), { httpStatus: 405 });
    }
    return null;
  }
}
