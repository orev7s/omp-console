import { create } from 'zustand';
import type { ConnectionMode, ServerFrame } from '@omp-console/protocol';
import { TOPICS } from '@omp-console/protocol';
import { ApiClient, ApiError } from '../api/client';
import { buildUrls, isSecureMode } from '../api/url';
import { RealtimeClient, type RealtimeStatus } from '../realtime/client';
import {
  clearDeviceId,
  clearDeviceToken,
  loadDeviceId,
  loadDeviceToken,
  loadServerConfig,
  saveDeviceId,
  saveDeviceToken,
  saveServerConfig,
} from '../storage/secure';
import { describeError, type ConnectionError } from './connectionErrors';

export interface ConnectionConfig {
  host: string;
  port: number;
  mode: ConnectionMode;
  deviceName: string;
}

export interface AgentInfo {
  serverId: string;
  name: string;
  version: string;
  agentState: string;
}

export interface LogEntry {
  at: number;
  text: string;
}

interface ConnectionStore {
  config: ConnectionConfig;
  token: string | null;
  /** This device's server-side id, used to mark and rotate the current device. */
  deviceId: string | null;
  realtime: RealtimeStatus;
  agent: AgentInfo | null;
  lastError: ConnectionError | null;
  busy: boolean;
  hydrated: boolean;
  log: LogEntry[];
  /** True once a connection has been established this session. */
  everConnected: boolean;

  initialize(): Promise<void>;
  setConfig(patch: Partial<ConnectionConfig>): void;
  clearError(): void;
  pair(code: string): Promise<boolean>;
  connect(): Promise<boolean>;
  disconnect(): void;
  /** Swap the stored token after a successful rotation. */
  updateToken(token: string): Promise<void>;
  sendEcho(message: string): void;
  clearLog(): void;
  forgetDevice(): Promise<void>;
}

const MAX_LOG = 100;

/**
 * The single app-wide realtime client, created with the connection store. Other
 * stores (the session store) attach frame listeners and manage subscriptions
 * through this accessor so the app keeps exactly one WebSocket.
 */
let realtimeClient: RealtimeClient | null = null;

export function getRealtimeClient(): RealtimeClient | null {
  return realtimeClient;
}

function appendLog(log: LogEntry[], text: string): LogEntry[] {
  const next: LogEntry[] = [{ at: Date.now(), text }, ...log];
  return next.slice(0, MAX_LOG);
}

function describeFrame(frame: ServerFrame): string {
  switch (frame.type) {
    case 'hello':
      return `hello from ${frame.data.name} (api v${frame.data.apiVersion})`;
    case 'event':
      return `event ${frame.topic} #${frame.seq}`;
    case 'response':
      return `response ${frame.id} ${frame.ok ? 'ok' : 'error'}`;
    case 'pong':
      return `pong ${frame.id}`;
    default:
      return 'frame';
  }
}

export const useConnection = create<ConnectionStore>((set, get) => {
  const realtime = new RealtimeClient({
    target: () => {
      const { token, config } = get();
      if (!token || config.host.trim() === '') return null;
      return { url: buildUrls(config).ws, token };
    },
    subscribeTopics: ['server.status', TOPICS.agentStatus],
  });
  realtimeClient = realtime;

  realtime.onStatus((status: RealtimeStatus) => {
    set(state => ({
      realtime: status,
      everConnected: state.everConnected || status.state === 'connected',
    }));
  });

  realtime.onFrame((frame: ServerFrame) => {
    set(state => ({ log: appendLog(state.log, describeFrame(frame)) }));
    if (frame.type === 'hello') {
      const data = frame.data;
      set({
        agent: {
          serverId: data.serverId,
          name: data.name,
          version: data.version,
          agentState: data.agentState,
        },
      });
    }
  });

  return {
    config: { host: '', port: 443, mode: 'https_domain', deviceName: 'Android device' },
    token: null,
    deviceId: null,
    realtime: realtime.getStatus(),
    agent: null,
    lastError: null,
    busy: false,
    hydrated: false,
    log: [],
    everConnected: false,

    async initialize() {
      try {
        const stored = await loadServerConfig();
        const token = await loadDeviceToken();
        const deviceId = await loadDeviceId();
        set(state => ({ config: stored ?? state.config, token, deviceId }));
      } catch {
        // Storage unavailable: start fresh rather than block the app.
      } finally {
        set({ hydrated: true });
      }
    },

    setConfig(patch) {
      set(state => {
        const config = { ...state.config, ...patch };
        void saveServerConfig(config);
        return { config };
      });
    },

    clearError() {
      set({ lastError: null });
    },

    async pair(code) {
      const { config } = get();
      set({ busy: true, lastError: null });
      try {
        const client = new ApiClient(buildUrls(config));
        const result = await client.pair(code.trim(), config.deviceName);
        await saveDeviceToken(result.deviceToken);
        await saveDeviceId(result.deviceId);
        set(state => ({
          token: result.deviceToken,
          deviceId: result.deviceId,
          busy: false,
          log: appendLog(state.log, 'Device paired'),
        }));
        return true;
      } catch (error) {
        const mapped =
          error instanceof ApiError && error.code === 'unauthorized'
            ? {
                code: 'unauthorized',
                title: 'Code not accepted',
                message: 'That pairing code was not accepted. Generate a new one on your server.',
                retryable: true,
              }
            : describeError(error);
        set({ busy: false, lastError: mapped });
        return false;
      }
    },

    async connect() {
      const { config, token } = get();
      if (!token) {
        set({
          lastError: {
            code: 'no_token',
            title: 'Pair first',
            message: 'Pair this device with your server, then connect.',
            retryable: true,
          },
        });
        return false;
      }
      set({ busy: true, lastError: null });
      try {
        const client = new ApiClient(buildUrls(config));
        const health = await client.health();
        const meta = await client.meta(token);
        set(state => ({
          busy: false,
          agent: {
            serverId: meta.serverId,
            name: meta.name,
            version: meta.version,
            agentState: meta.agentState,
          },
          log: appendLog(
            state.log,
            `Reached ${health.name} over ${isSecureMode(config.mode) ? 'HTTPS' : 'HTTP'}`,
          ),
        }));
        realtime.connect();
        return true;
      } catch (error) {
        const mapped =
          error instanceof ApiError && error.code === 'unauthorized'
            ? {
                code: 'unauthorized',
                title: 'Signed out',
                message: 'This phone was signed out or its token expired. Pair it again with a new code.',
                retryable: false,
              }
            : describeError(error);
        set({ busy: false, lastError: mapped });
        return false;
      }
    },

    disconnect() {
      realtime.disconnect();
    },

    async updateToken(next) {
      await saveDeviceToken(next);
      set({ token: next });
    },

    sendEcho(message) {
      realtime.sendEcho(message);
    },

    clearLog() {
      set({ log: [] });
    },

    async forgetDevice() {
      realtime.disconnect();
      try {
        await clearDeviceToken();
        await clearDeviceId();
      } finally {
        set({ token: null, deviceId: null, agent: null, everConnected: false, lastError: null });
      }
    },
  };
});