import type { ConnectionMode } from '@omp-console/protocol';

/**
 * Web storage implementation. react-native-keychain is native only, so on the
 * web build we use localStorage. This file is selected by Vite via the `.web`
 * extension; the native build uses `secure.ts`.
 */

const CONFIG_KEY = 'omp-console.server';
const TOKEN_KEY = 'omp-console.device-token';
const DEVICE_ID_KEY = 'omp-console.device-id';

export interface StoredServerConfig {
  host: string;
  port: number;
  mode: ConnectionMode;
  deviceName: string;
}

export async function saveServerConfig(config: StoredServerConfig): Promise<void> {
  window.localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

export async function loadServerConfig(): Promise<StoredServerConfig | null> {
  const raw = window.localStorage.getItem(CONFIG_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredServerConfig;
  } catch {
    return null;
  }
}

export async function saveDeviceToken(token: string): Promise<void> {
  window.localStorage.setItem(TOKEN_KEY, token);
}

export async function loadDeviceToken(): Promise<string | null> {
  return window.localStorage.getItem(TOKEN_KEY);
}

export async function clearDeviceToken(): Promise<void> {
  window.localStorage.removeItem(TOKEN_KEY);
}

export async function saveDeviceId(id: string): Promise<void> {
  window.localStorage.setItem(DEVICE_ID_KEY, id);
}

export async function loadDeviceId(): Promise<string | null> {
  return window.localStorage.getItem(DEVICE_ID_KEY);
}

export async function clearDeviceId(): Promise<void> {
  window.localStorage.removeItem(DEVICE_ID_KEY);
}