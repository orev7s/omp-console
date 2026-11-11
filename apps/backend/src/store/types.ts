import type { Config } from "../config/index.js";

export const STORE_SCHEMA_VERSION = 1 as const;

export interface DeviceRecord {
  id: string;
  name: string;
  tokenHash: string;
  deviceSecretHash: string | null;
  scopes: string[];
  createdAt: string;
  lastSeenAt: string | null;
}

export interface PairingRecord {
  codeHash: string | null;
  expiresAt: number | null;
}

export interface StoreData {
  schemaVersion: typeof STORE_SCHEMA_VERSION;
  serverId: string;
  pairing: PairingRecord;
  devices: DeviceRecord[];
}
