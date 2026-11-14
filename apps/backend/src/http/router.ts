import type { IncomingMessage, ServerResponse } from "node:http";
import type { Scope } from "@omp-console/protocol";
import type { AgentHostClient } from "../agenthost/client.js";
import type { Config } from "../config/index.js";
import type { Logger } from "../log/index.js";
import type { Store } from "../store/index.js";
import type { AuthService } from "../auth/index.js";
import type { DeviceRecord } from "../store/types.js";
import type { WsHub } from "../ws/hub.js";
import type { SessionRegistry } from "../sessions/registry.js";

export interface RequestContext {
  req: IncomingMessage;
  res: ServerResponse;
  method: string;
  path: string;
  url: URL;
  requestId: string;
  remote: string;
  device: DeviceRecord | null;
  /** Path parameters captured by the router, for example `:id`. */
  params: Record<string, string>;
  body: unknown;
  log: Logger;
  config: Config;
  store: Store;
  auth: AuthService;
  /** Used to drop live sockets the instant a device is revoked. */
  hub: WsHub;
  /** Optional L2 connection to the agent host. Never spawns `omp`. */
  agent: AgentHostClient;
  /** Reconstructable session view fed by L2 events. */
  registry: SessionRegistry;
}

export interface RouteResult {
  status: number;
  body?: unknown;
}

export type RouteHandler = (ctx: RequestContext) => Promise<RouteResult> | RouteResult;

export interface RouteOptions {
  requireAuth: boolean;
  /** Minimum scope the authenticated device must hold. */
  scope?: Scope;
  /** Which limiter bucket applies; defaults to the general bucket. */
  rateLimit?: "default" | "pairing";
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
