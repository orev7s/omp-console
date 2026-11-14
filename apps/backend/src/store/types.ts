import type { Scope } from "@omp-console/protocol";

export const STORE_SCHEMA_VERSION = 3 as const;

export interface DeviceRecord {
  id: string;
  name: string;
  tokenHash: string;
  deviceSecretHash: string | null;
  scopes: Scope[];
  createdAt: string;
  lastSeenAt: string | null;
  /** When the device token expires; null means it does not expire. */
  tokenExpiresAt: string | null;
  /** When the device was revoked; null means active. */
  revokedAt: string | null;
  /** Last successful token rotation, for auditing. */
  tokenRotatedAt: string | null;
}

/**
 * An outstanding pairing code. Codes are short-lived and single-use: pairing
 * consumes the record in place rather than deleting it, so the audit trail keeps
 * which device used which code.
 */
export interface PairingCodeRecord {
  id: string;
  codeHash: string;
  createdAt: string;
  expiresAt: string;
  consumedAt: string | null;
  /** Device created by consuming this code, for traceability. */
  deviceId: string | null;
  /** Scopes to grant, or null to use the default set. */
  scopes: Scope[] | null;
}

/** A project root the user has registered to run agents in. */
export interface ProjectRecord {
  id: string;
  name: string;
  path: string;
  createdAt: string;
}

export interface StoreData {
  schemaVersion: typeof STORE_SCHEMA_VERSION;
  serverId: string;
  pairingCodes: PairingCodeRecord[];
  devices: DeviceRecord[];
  projects: ProjectRecord[];
}

/** Shape written by schema version 2, kept only for migration. */
export interface StoreDataV2 {
  schemaVersion: 2;
  serverId: string;
  pairingCodes: PairingCodeRecord[];
  devices: DeviceRecord[];
}

/** Shape written by schema version 1, kept only for migration. */
export interface StoreDataV1 {
  schemaVersion: 1;
  serverId: string;
  pairing: { codeHash: string | null; expiresAt: number | null };
  devices: Array<{
    id: string;
    name: string;
    tokenHash: string;
    deviceSecretHash: string | null;
    scopes: string[];
    createdAt: string;
    lastSeenAt: string | null;
  }>;
}