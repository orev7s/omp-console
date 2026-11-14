import { ALL_SCOPES, DEFAULT_DEVICE_SCOPES, type Scope } from "@omp-console/protocol";
import { randomId } from "../util/id.js";
import { nowIso } from "../util/time.js";
import {
  STORE_SCHEMA_VERSION,
  type DeviceRecord,
  type PairingCodeRecord,
  type ProjectRecord,
  type StoreData,
} from "./types.js";

/** Coerce an untrusted scope list into the known set, defaulting when empty. */
function coerceScopes(input: unknown): Scope[] {
  if (!Array.isArray(input)) return [...DEFAULT_DEVICE_SCOPES];
  const known = ALL_SCOPES as readonly string[];
  const valid = input.filter(
    (value): value is Scope => typeof value === "string" && known.includes(value),
  );
  return valid.length > 0 ? [...new Set(valid)] : [...DEFAULT_DEVICE_SCOPES];
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function normalizeDevice(raw: unknown): DeviceRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Record<string, unknown>;
  const id = asString(d["id"]);
  const name = asString(d["name"]);
  const tokenHash = asString(d["tokenHash"]);
  if (!id || !name || !tokenHash) return null;
  return {
    id,
    name,
    tokenHash,
    deviceSecretHash: asString(d["deviceSecretHash"]),
    scopes: coerceScopes(d["scopes"]),
    createdAt: asString(d["createdAt"]) ?? nowIso(),
    lastSeenAt: asString(d["lastSeenAt"]),
    tokenExpiresAt: asString(d["tokenExpiresAt"]),
    revokedAt: asString(d["revokedAt"]),
    tokenRotatedAt: asString(d["tokenRotatedAt"]),
  };
}

function normalizeCode(raw: unknown): PairingCodeRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Record<string, unknown>;
  const id = asString(c["id"]);
  const codeHash = asString(c["codeHash"]);
  const expiresAt = asString(c["expiresAt"]);
  if (!id || !codeHash || !expiresAt) return null;
  const scopes = Array.isArray(c["scopes"]) ? coerceScopes(c["scopes"]) : null;
  return {
    id,
    codeHash,
    createdAt: asString(c["createdAt"]) ?? nowIso(),
    expiresAt,
    consumedAt: asString(c["consumedAt"]),
    deviceId: asString(c["deviceId"]),
    scopes,
  };
}

function normalizeProject(raw: unknown): ProjectRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  const id = asString(p["id"]);
  const path = asString(p["path"]);
  if (!id || !path) return null;
  return {
    id,
    name: asString(p["name"]) ?? path,
    path,
    createdAt: asString(p["createdAt"]) ?? nowIso(),
  };
}

export function defaultStoreData(): StoreData {
  return {
    schemaVersion: STORE_SCHEMA_VERSION,
    serverId: randomId(12),
    pairingCodes: [],
    devices: [],
    projects: [],
  };
}

/**
 * Bring a persisted file up to the current schema, tolerating missing or
 * unknown fields. Schema v1 held a single `pairing` slot; its plaintext code is
 * not recoverable from the hash, so it is dropped and the operator mints a new
 * one. Schema v2 is bumped to v3 by adding an empty project registry; devices
 * and pairing codes carry forward unchanged.
 */
export function migrateStore(raw: unknown): StoreData {
  const base = defaultStoreData();
  if (!raw || typeof raw !== "object") return base;

  const data = raw as Record<string, unknown>;
  const serverId = asString(data["serverId"]) ?? base.serverId;
  const devices = Array.isArray(data["devices"])
    ? data["devices"].map(normalizeDevice).filter((d): d is DeviceRecord => d !== null)
    : [];
  const pairingCodes = Array.isArray(data["pairingCodes"])
    ? data["pairingCodes"].map(normalizeCode).filter((c): c is PairingCodeRecord => c !== null)
    : [];
  const projects = Array.isArray(data["projects"])
    ? data["projects"].map(normalizeProject).filter((p): p is ProjectRecord => p !== null)
    : [];

  return {
    schemaVersion: STORE_SCHEMA_VERSION,
    serverId,
    pairingCodes,
    devices,
    projects,
  };
}
