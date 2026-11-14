import { createServer, type Server } from "node:http";
import {
  API_VERSION,
  PRODUCT_NAME,
  SOFTWARE_VERSION,
  TOPICS,
  WS_PATH,
  WS_PROTOCOL_VERSION,
  sessionEventTopic,
  type AgentState,
  type AgentStatusEvent,
  type HelloData,
  type ServerStatusEvent,
} from "@omp-console/protocol";
import { AgentHostClient } from "./agenthost/client.js";
import type { AuthService } from "./auth/index.js";
import { RateLimiter } from "./auth/rate-limit.js";
import type { Config } from "./config/index.js";
import { createHttpHandler } from "./http/handler.js";
import { buildRouter } from "./http/routes.js";
import type { Logger } from "./log/index.js";
import { SessionRegistry } from "./sessions/registry.js";
import { toAgentStatusEvent, toL1SessionEvent } from "./sessions/events.js";
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
  agent: AgentHostClient;
  registry: SessionRegistry;
}

export function createApp(options: AppOptions): App {
  const { config, log, store, auth } = options;
  const startedAt = Date.now();

  const agent = new AgentHostClient({
    socketPath: config.agentSocketPath,
    logger: log.child({ component: "agenthost" }),
  });

  const agentState = (): AgentState => {
    const state = agent.agentStatus?.state ?? "unavailable";
    return state === "failed" ? "crashed" : state;
  };

  const registry = new SessionRegistry();
  const router = buildRouter();
  const limiters = {
    default: new RateLimiter(config.rateLimit.windowMs, config.rateLimit.max),
    pairing: new RateLimiter(config.pairingRateLimit.windowMs, config.pairingRateLimit.max),
  };

  const statusData = (): ServerStatusEvent => ({
    agentState: agentState(),
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
    agentState: agentState(),
    connectionMode: config.connectionMode,
  });

  const agentStatusData = (): AgentStatusEvent =>
    toAgentStatusEvent(agent.agentStatus, registry.list());

  const hub = new WsHub({
    logger: log.child({ component: "ws" }),
    authorize: (token) => auth.authenticate(token),
    helloData,
    statusData,
    agentStatusData,
    maxBufferedBytes: config.maxBufferedBytes,
  });

  // Feed the registry from L2 and fan the same events out to subscribed
  // devices. The registry is the only writer of L1 session state; the hub only
  // forwards, so a device never sees an L2 shape.
  agent.onEvent((event) => {
    switch (event.type) {
      case "agent.state":
        registry.applyAgentStatus(event.status);
        hub.broadcastEvent(TOPICS.agentStatus, agentStatusData());
        break;
      case "session.state":
        registry.upsertFromInfo(event.session);
        // The session list is part of the agent.status payload, so a session
        // change is a status change for every subscriber.
        hub.broadcastEvent(TOPICS.agentStatus, agentStatusData());
        break;
      case "session.event": {
        registry.applyEvent(event.sessionId, event.event);
        const l1Event = toL1SessionEvent(event.event);
        if (l1Event !== null) {
          hub.broadcastEvent(sessionEventTopic(event.sessionId), {
            sessionId: event.sessionId,
            event: l1Event,
          });
        }
        break;
      }
      default:
        break;
    }
  });

  // After every (re)connect the agent host forgets per-socket subscriptions, so
  // re-subscribe to the sessions it reports and refresh the status topic.
  agent.onConnect(() => {
    const status = agent.agentStatus;
    if (status === null) return;
    registry.applyAgentStatus(status);
    hub.broadcastEvent(TOPICS.agentStatus, agentStatusData());
    const ids = status.sessions.map((session) => session.id);
    if (ids.length > 0) {
      void agent.subscribeSessions(ids).catch((error: unknown) => {
        log.warn("Failed to re-subscribe to sessions.", { error: String(error) });
      });
    }
  });

  const server: Server = createServer(
    createHttpHandler({
      router,
      config,
      log: log.child({ component: "http" }),
      store,
      auth,
      hub,
      agent,
      registry,
      limiters,
    }),
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
    agent,
    registry,

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

      agent.start();

      heartbeat = setInterval(() => {
        hub.pingAll();
        hub.broadcastEvent(TOPICS.serverStatus, statusData());
      }, config.heartbeatMs);
      prune = setInterval(() => {
        limiters.default.prune();
        limiters.pairing.prune();
      }, 60_000);

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
      agent.close();
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
