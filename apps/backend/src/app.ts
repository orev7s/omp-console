import { createServer, type Server } from "node:http";
import {
  API_VERSION,
  PRODUCT_NAME,
  SOFTWARE_VERSION,
  TOPICS,
  WS_PATH,
  WS_PROTOCOL_VERSION,
  type HelloData,
  type ServerStatusEvent,
} from "@omp-console/protocol";
import type { AuthService } from "./auth/index.js";
import { RateLimiter } from "./auth/rate-limit.js";
import type { Config } from "./config/index.js";
import { createHttpHandler } from "./http/handler.js";
import { buildRouter } from "./http/routes.js";
import type { Logger } from "./log/index.js";
import type { Store } from "./store/index.js";
import { nowIso } from "./util/time.js";
import { WsHub } from "./ws/hub.js";

export interface AppOptions {
  config: Config;
  log: Logger;
  store: Store;
  auth: AuthService;
}

export interface App {
  start(): Promise<void>;
  stop(): Promise<void>;
  address(): { host: string; port: number };
  hub: WsHub;
}

export function createApp(options: AppOptions): App {
  const { config, log, store, auth } = options;
  const startedAt = Date.now();

  const router = buildRouter();
  const rateLimiter = new RateLimiter(config.rateLimit.windowMs, config.rateLimit.max);

  const statusData = (): ServerStatusEvent => ({
    agentState: "unavailable",
    connections: hub.connectionCount(),
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    time: nowIso(),
  });

  const helloData = (connectionId: string): HelloData => ({
    connectionId,
    serverId: store.data.serverId,
    name: config.name,
    version: SOFTWARE_VERSION,
    apiVersion: API_VERSION,
    wsProtocolVersion: WS_PROTOCOL_VERSION,
    agentState: "unavailable",
    connectionMode: config.connectionMode,
  });

  const hub = new WsHub({
    logger: log.child({ component: "ws" }),
    authorize: (token) => auth.authenticate(token),
    helloData,
    statusData,
    maxBufferedBytes: config.maxBufferedBytes,
  });

  const server: Server = createServer(
    createHttpHandler({ router, config, log: log.child({ component: "http" }), store, auth, rateLimiter }),
  );

  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname !== WS_PATH) {
      socket.write("HTTP/1.1 404 Not Found\r\nConnection: close\r\nContent-Length: 0\r\n\r\n");
      socket.destroy();
      return;
    }
    hub.handleUpgrade(req, socket, head);
  });

  let heartbeat: NodeJS.Timeout | null = null;
  let prune: NodeJS.Timeout | null = null;
  let boundPort = config.port;

  return {
    hub,

    async start(): Promise<void> {
      await new Promise<void>((resolve, reject) => {
        const onError = (error: Error): void => {
          server.off("listening", onListening);
          reject(error);
        };
        const onListening = (): void => {
          server.off("error", onError);
          resolve();
        };
        server.once("error", onError);
        server.once("listening", onListening);
        server.listen(config.port, config.host);
      });

      const addr = server.address();
      if (addr && typeof addr === "object") boundPort = addr.port;

      heartbeat = setInterval(() => {
        hub.pingAll();
        hub.broadcastEvent(TOPICS.serverStatus, statusData());
      }, config.heartbeatMs);
      prune = setInterval(() => rateLimiter.prune(), 60_000);

      log.info("Control plane listening.", {
        host: config.host,
        port: boundPort,
        wsPath: WS_PATH,
        product: PRODUCT_NAME,
      });
    },

    async stop(): Promise<void> {
      if (heartbeat) clearInterval(heartbeat);
      if (prune) clearInterval(prune);
      heartbeat = null;
      prune = null;
      hub.closeAll();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await store.save().catch(() => undefined);
      log.info("Control plane stopped.");
    },

    address(): { host: string; port: number } {
      const addr = server.address();
      if (addr && typeof addr === "object") {
        return { host: addr.address, port: addr.port };
      }
      return { host: config.host, port: boundPort };
    },
  };
}
