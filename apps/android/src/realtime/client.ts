import type { ClientFrame, ServerFrame } from '@omp-console/protocol';
import { WS_PROTOCOL_VERSION, sessionEventTopic } from '@omp-console/protocol';
import { Platform } from 'react-native';

export type RealtimeState = 'idle' | 'connecting' | 'connected' | 'reconnecting';

export interface RealtimeStatus {
  state: RealtimeState;
  attempt: number;
  lastError: string | null;
}

type StatusListener = (status: RealtimeStatus) => void;
type FrameListener = (frame: ServerFrame) => void;

export interface RealtimeOptions {
  /** Returns the current socket URL and bearer token, or null when unconfigured. */
  target: () => { url: string; token: string } | null;
  subscribeTopics: string[];
}

const MAX_BACKOFF_MS = 15_000;

/** The wire schema caps a subscribe frame at 32 topics, so batch below that. */
const MAX_TOPICS_PER_FRAME = 32;

function chunks<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * One WebSocket client for the app. Owns reconnect with backoff and jitter, the
 * heartbeat ping, and re-subscription after a reconnect.
 *
 * Subscriptions are held as a desired-topic set that survives a reconnect: the
 * full set is re-sent on every open, so screens can subscribe and unsubscribe at
 * runtime without knowing the socket state.
 */
export class RealtimeClient {
  private socket: WebSocket | null = null;
  private status: RealtimeStatus = { state: 'idle', attempt: 0, lastError: null };
  private readonly statusListeners = new Set<StatusListener>();
  private readonly frameListeners = new Set<FrameListener>();
  private readonly desiredTopics = new Set<string>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private shouldRun = false;
  private counter = 0;

  constructor(private readonly options: RealtimeOptions) {
    for (const topic of options.subscribeTopics) this.desiredTopics.add(topic);
  }

  onStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  onFrame(listener: FrameListener): () => void {
    this.frameListeners.add(listener);
    return () => this.frameListeners.delete(listener);
  }

  getStatus(): RealtimeStatus {
    return this.status;
  }

  connect(): void {
    this.shouldRun = true;
    this.open();
  }

  disconnect(): void {
    this.shouldRun = false;
    this.clearTimers();
    if (this.socket) {
      try {
        this.socket.close(1000, 'client disconnect');
      } catch {
        // ignore
      }
      this.socket = null;
    }
    this.setStatus({ state: 'idle', attempt: 0, lastError: null });
  }

  sendEcho(message: string): void {
    this.send({ type: 'echo', id: this.nextId(), v: WS_PROTOCOL_VERSION, ts: Date.now(), message });
  }

  /** Adds topics to the desired set and subscribes now if connected. */
  subscribeTo(topics: string[]): void {
    const added = topics.filter(topic => !this.desiredTopics.has(topic));
    if (added.length === 0) return;
    for (const topic of added) this.desiredTopics.add(topic);
    for (const batch of chunks(added, MAX_TOPICS_PER_FRAME)) this.sendSubscribe(batch);
  }

  /** Removes topics from the desired set and unsubscribes now if connected. */
  unsubscribeFrom(topics: string[]): void {
    const removed = topics.filter(topic => this.desiredTopics.has(topic));
    if (removed.length === 0) return;
    for (const topic of removed) this.desiredTopics.delete(topic);
    for (const batch of chunks(removed, MAX_TOPICS_PER_FRAME)) this.sendUnsubscribe(batch);
  }

  subscribeSession(id: string): void {
    this.subscribeTo([sessionEventTopic(id)]);
  }

  unsubscribeSession(id: string): void {
    this.unsubscribeFrom([sessionEventTopic(id)]);
  }

  private sendSubscribe(topics: string[]): void {
    this.send({ type: 'subscribe', id: this.nextId(), v: WS_PROTOCOL_VERSION, ts: Date.now(), topics });
  }

  private sendUnsubscribe(topics: string[]): void {
    this.send({ type: 'unsubscribe', id: this.nextId(), v: WS_PROTOCOL_VERSION, ts: Date.now(), topics });
  }

  private nextId(): string {
    this.counter += 1;
    return `c${this.counter}`;
  }

  private send(frame: ClientFrame): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(frame));
    }
  }

  private open(): void {
    const target = this.options.target();
    if (!target) {
      this.setStatus({ state: 'idle', attempt: 0, lastError: 'Server is not configured.' });
      return;
    }

    this.setStatus({ ...this.status, state: this.status.attempt > 0 ? 'reconnecting' : 'connecting' });

    let socket: WebSocket;
    try {
      if (Platform.OS === 'web') {
        // Browsers cannot set headers on a WebSocket upgrade, so the bearer
        // token travels as a subprotocol. Never a query string.
        socket = new WebSocket(target.url, [`bearer.${target.token}`]);
      } else {
        socket = new WebSocket(target.url, undefined, {
          headers: { authorization: `Bearer ${target.token}` },
        } as never);
      }
    } catch (error) {
      this.scheduleReconnect(String(error));
      return;
    }
    this.socket = socket;

    socket.onopen = () => {
      this.setStatus({ state: 'connected', attempt: 0, lastError: null });
      // Re-send the full desired set so a reconnect restores every subscription.
      const topics = [...this.desiredTopics];
      if (topics.length > 0) {
        for (const batch of chunks(topics, MAX_TOPICS_PER_FRAME)) this.sendSubscribe(batch);
      }
      this.startHeartbeat();
    };

    socket.onmessage = (event) => {
      try {
        const frame = JSON.parse(String(event.data)) as ServerFrame;
        for (const listener of this.frameListeners) listener(frame);
      } catch {
        // Ignore frames we cannot parse.
      }
    };

    socket.onerror = () => {
      // onclose follows; record a generic error here.
      this.setStatus({ ...this.status, lastError: 'Connection error.' });
    };

    socket.onclose = () => {
      this.socket = null;
      this.stopHeartbeat();
      if (this.shouldRun) this.scheduleReconnect('Connection closed.');
    };
  }

  private scheduleReconnect(reason: string): void {
    if (!this.shouldRun) return;
    const attempt = this.status.attempt + 1;
    const base = Math.min(MAX_BACKOFF_MS, 500 * 2 ** Math.min(attempt - 1, 6));
    const jitter = base * 0.3 * Math.random();
    const delay = Math.round(base + jitter);
    this.setStatus({ state: 'reconnecting', attempt, lastError: reason });
    this.reconnectTimer = setTimeout(() => this.open(), delay);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.send({ type: 'ping', id: this.nextId(), v: WS_PROTOCOL_VERSION, ts: Date.now() });
    }, 20_000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

  private clearTimers(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.stopHeartbeat();
  }

  private setStatus(status: RealtimeStatus): void {
    this.status = status;
    for (const listener of this.statusListeners) listener(status);
  }
}
