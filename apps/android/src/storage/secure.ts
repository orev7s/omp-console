import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Keychain from 'react-native-keychain';
import type { ConnectionMode } from '@omp-console/protocol';

const CONFIG_KEY = 'omp-console.server';
const TOKEN_SERVICE = 'omp-console.device-token';

export interface StoredServerConfig {
  host: string;
  port: number;
  mode: ConnectionMode;
  deviceName: string;
}

export async function saveServerConfig(config: StoredServerConfig): Promise<void> {
  await AsyncStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

export async function loadServerConfig(): Promise<StoredServerConfig | null> {
  const raw = await AsyncStorage.getItem(CONFIG_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredServerConfig;
  } catch {
    return null;
  }
}

export async function saveDeviceToken(token: string): Promise<void> {
  await Keychain.setGenericPassword('device', token, { service: TOKEN_SERVICE });
}

export async function loadDeviceToken(): Promise<string | null> {
  const credentials = await Keychain.getGenericPassword({ service: TOKEN_SERVICE });
  return credentials ? credentials.password : null;
}

export async function clearDeviceToken(): Promise<void> {
  await Keychain.resetGenericPassword({ service: TOKEN_SERVICE });
}
