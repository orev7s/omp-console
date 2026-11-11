import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import {
  ClientFrameSchema,
  WS_PROTOCOL_VERSION,
  type AgentState,
  type HelloData,
  type ServerStatusEvent,
} from "@omp-console/protocol";
import { WebSocket, WebSocketServer, type RawData } from "ws";
import type { Logger } from "../log/index.js";
import type { DeviceRecord } from "../store/types.js";
import { connectionId } from "../util/id.js";

interface Connection {
  id: string;
  socket: WebSocket;
  device: DeviceRecord;
  topics: Set<string>;
  isAlive: boolean;
}

export interface WsHubOptions {
  logger: Logger;
  authorize: (token: string | null) => DeviceRecord | null;
  helloData: (connectionId: string) => HelloData;
  statusData: () => ServerStatusEvent;
  maxBufferedBytes: number;
}

function extractBearer(header: string | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1] ?? null;
}

/**
 * Browsers cannot set an Authorization header on a WebSocket upgrade, so they
 * may carry the token as a subprotocol named `bearer.<token>`. Header auth
 * still takes precedence. Tokens are never placed in query strings.
 */
function extractSubprotocolToken(header: string | string[] | undefined): string | null {
  if (!header) return null;
  const value = Array.isArray(header) ? header.join(',') : header;
  for (const part of value.split(',')) {
    const trimmed = part.trim();
    if (trimmed.startsWith('bearer.')) {
      const token = trimmed.slice('bearer.'.length);
      if (token.length > 0) return token;
    }
  }
  return null;
}

/**
 * Owns the WebSocket endpoint: upgrade authentication, per-connection topic
 * subscriptions, heartbeat, and frame dispatch. It never touches OMP.
 */
export class WsHub {
  private readonly wss = new WebSocketServer({ noServer: true });
  private readonly connections = new Map<string, Connection>();
  private readonly topicSeq = new Map<string, number>();

  constructor(private readonly opts: WsHubOptions) {}

  handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
    const token =
      extractBearer(req.headers.authorization) ??
      extractSubprotocolToken(req.headers['sec-websocket-protocol']);
    const device = this.opts.authorize(token);
    if (!device) {
      socket.write(
        "HTTP/1.1 401 Unauthorized\r\nConnection: close\r\nContent-Length: 0\r\n\r\n",
      );
      socket.destroy();
      return;
    }

    this.wss.handleUpgrade(req, socket, head, (ws) => {
      this.register(ws, device);
    });
  }

  private register(ws: WebSocket, device: DeviceRecord): void {
    const id = connectionId();
    const conn: Connection = { id, socket: ws, device, topics: new Set(), isAlive: true };
    this.connections.set(id, conn);

    ws.on("pong", () => {
      conn.isAlive = true;
    });
    ws.on("message", (data: RawData) => this.onMessage(conn, data));
    ws.on("close", () => {
      this.connections.delete(id);
      this.opts.logger.debug("Connection closed.", { connectionId: id, deviceId: device.id });
    });
    ws.on("error", (error: Error) => {
      this.opts.logger.warn("Connection error.", { connectionId: id, error: String(error) });
    });

    this.opts.logger.info("Connection opened.", { connectionId: id, deviceId: device.id });
    this.send(conn, {
      type: "hello",
      v: WS_PROTOCOL_VERSION,
      ts: Date.now(),
      data: this.opts.helloData(id),
    });
  }

  private onMessage(conn: Connection, data: RawData): void {
    let raw: unknown;
    const text = data.toString();
    try {
      raw = JSON.parse(text);
    } catch {
      this.send(conn, {
        type: "response",
        v: WS_PROTOCOL_VERSION,
        ts: Date.now(),
        id: "malformed",
        ok: false,
        error: { code: "bad_request", message: "Frame is not valid JSON." },
      });
      return;
    }

    const parsed = ClientFrameSchema.safeParse(raw);
    if (!parsed.success) {
      const id = typeof (raw as { id?: unknown }).id === "string" ? (raw as { id: string }).id : "unknown";
      this.send(conn, {
        type: "response",
        v: WS_PROTOCOL_VERSION,
        ts: Date.now(),
        id,
        ok: false,
        error: { code: "bad_request", message: "Unrecognized frame." },
      });
      return;
    }

    const frame = parsed.data;
    switch (frame.type) {
      case "subscribe": {
        for (const topic of frame.topics) conn.topics.add(topic);
        this.send(conn, {
          type: "response",
          v: WS_PROTOCOL_VERSION,
          ts: Date.now(),
          id: frame.id,
          ok: true,
          data: { topics: [...conn.topics] },
        });
        // Send an immediate snapshot so the client does not wait a heartbeat.
        if (conn.topics.has("server.status")) {
          this.sendEvent(conn, "server.status", this.opts.statusData());
        }
        break;
      }
      case "unsubscribe": {
        for (const topic of frame.topics) conn.topics.delete(topic);
        this.send(conn, {
          type: "response",
          v: WS_PROTOCOL_VERSION,
          ts: Date.now(),
          id: frame.id,
          ok: true,
          data: { topics: [...conn.topics] },
        });
        break;
      }
      case "ping": {
        this.send(conn, {
          type: "pong",
          v: WS_PROTOCOL_VERSION,
          ts: Date.now(),
          id: frame.id,
        });
        break;
      }
      case "echo": {
        this.send(conn, {
          type: "response",
          v: WS_PROTOCOL_VERSION,
          ts: Date.now(),
          id: frame.id,
          ok: true,
          data: { message: frame.message, connectionId: conn.id },
        });
        break;
      }
      default:
        break;
    }
  }

  private nextSeq(topic: string): number {
    const current = this.topicSeq.get(topic) ?? 0;
    this.topicSeq.set(topic, current + 1);
    return current;
  }

  private send(conn: Connection, frame: unknown): void {
    if (conn.socket.readyState !== WebSocket.OPEN) return;
    if (conn.socket.bufferedAmount > this.opts.maxBufferedBytes) {
      this.opts.logger.warn("Disconnecting slow consumer.", {
        connectionId: conn.id,
        bufferedAmount: conn.socket.bufferedAmount,
      });
      conn.socket.terminate();
      return;
    }
    conn.socket.send(JSON.stringify(frame));
  }

  private sendEvent(conn: Connection, topic: string, data: unknown): void {
    this.send(conn, {
      type: "event",
      v: WS_PROTOCOL_VERSION,
      ts: Date.now(),
      topic,
      seq: this.nextSeq(topic),
      data,
    });
  }

  broadcastEvent(topic: string, data: unknown): void {
    for (const conn of this.connections.values()) {
      if (conn.topics.has(topic)) this.sendEvent(conn, topic, data);
    }
  }

  pingAll(): void {
    for (const conn of this.connections.values()) {
      if (!conn.isAlive) {
        this.opts.logger.debug("Heartbeat missed; terminating connection.", { connectionId: conn.id });
        conn.socket.terminate();
        this.connections.delete(conn.id);
        continue;
      }
      conn.isAlive = false;
      try {
        conn.socket.ping();
      } catch (error) {
        this.opts.logger.debug("Failed to send heartbeat.", { connectionId: conn.id, error: String(error) });
      }
    }
  }

  connectionCount(): number {
    return this.connections.size;
  }

  closeAll(): void {
    for (const conn of this.connections.values()) {
      try {
        conn.socket.close(1001, "server shutting down");
      } catch {
        // ignore
      }
    }
    this.connections.clear();
  }
}

export type { AgentState };
