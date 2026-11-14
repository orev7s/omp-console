import {
  API_VERSION,
  DEFAULT_DEVICE_SCOPES,
  WS_PROTOCOL_VERSION,
  type DeviceSummary,
  type PairRequest,
  type PairResponse,
  type Scope,
} from "@omp-console/protocol";
import type { Config } from "../config/index.js";
import type { Logger } from "../log/index.js";
import type { Store } from "../store/index.js";
import type { DeviceRecord, PairingCodeRecord } from "../store/types.js";
import { pairingCode, randomId, randomToken } from "../util/id.js";
import { hashedStringEqual, nowIso } from "../util/time.js";
import { hashToken } from "./tokens.js";

export class AuthError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly retryable = false,
  ) {
    super(message);
  }
}

const LAST_SEEN_THROTTLE_MS = 60_000;
/** Bound stored code records so a bad actor cannot grow the file. */
const MAX_CODE_RECORDS = 5;
/** How long consumed or expired code records are kept for traceability. */
const CODE_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

function isLive(record: PairingCodeRecord, now: number): boolean {
  return record.consumedAt === null && Date.parse(record.expiresAt) > now;
}

export interface CreateCodeOptions {
  ttlMs?: number;
  /** Scopes the paired device should receive; defaults to the standard set. */
  scopes?: Scope[];
}

/** Credential lifecycle: pairing, device registry, revocation, rotation. */
export class AuthService {
  constructor(
    private readonly store: Store,
    private readonly config: Config,
    private readonly log: Logger,
  ) {}

  /** Mint a pairing code and persist its hash. Returns the plaintext once. */
  async createPairingCode(options: CreateCodeOptions = {}): Promise<string> {
    const now = Date.now();
    const ttlMs = options.ttlMs ?? this.config.pairingCodeTtlMs;
    const code = this.config.pairingCode ?? pairingCode(8);
    const record: PairingCodeRecord = {
      id: randomId(9),
      codeHash: hashToken(code),
      createdAt: nowIso(),
      expiresAt: new Date(now + ttlMs).toISOString(),
      consumedAt: null,
      deviceId: null,
      scopes: options.scopes ? [...options.scopes] : null,
    };

    await this.store.update((state) => {
      const cutoff = now - CODE_RETENTION_MS;
      // Drop records older than the retention window; recent consumed codes stay
      // for traceability.
      state.pairingCodes = state.pairingCodes.filter((c) => Date.parse(c.expiresAt) > cutoff);
      state.pairingCodes.push(record);
      if (state.pairingCodes.length > MAX_CODE_RECORDS) {
        state.pairingCodes = state.pairingCodes.slice(-MAX_CODE_RECORDS);
      }
    });

    this.log.info("Pairing code issued.", { expiresAt: record.expiresAt });
    return code;
  }

  /**
   * Backwards-compatible helper: mint a code only when none is live, so a
   * restart never invalidates a code the installer already printed. `force`
   * mints a fresh one regardless.
   */
  async ensurePairingCode(force = false): Promise<string | null> {
    const now = Date.now();
    const live = this.store.data.pairingCodes.filter((c) => isLive(c, now));
    if (!force && live.length > 0) return null;

    // An explicit regeneration replaces outstanding codes: a code that is being
    // replaced must stop working. Otherwise an old printed code stays valid.
    if (force && live.length > 0) {
      const invalidatedAt = nowIso();
      await this.store.update(() => {
        for (const record of live) record.consumedAt = invalidatedAt;
      });
    }

    return this.createPairingCode();
  }

  async pair(input: PairRequest, remote: string): Promise<PairResponse> {
    const now = Date.now();
    const targetHash = hashToken(input.code);
    const match = this.store.data.pairingCodes.find(
      (c) => isLive(c, now) && hashedStringEqual(c.codeHash, targetHash),
    );
    if (!match) {
      // One message for unknown, expired, and already-used codes: revealing
      // which one it was helps a guesser.
      throw new AuthError(401, "unauthorized", "Invalid or expired pairing code.");
    }

    const token = randomToken(32);
    const createdAt = nowIso();
    const tokenExpiresAt =
      this.config.deviceTokenTtlMs !== null
        ? new Date(now + this.config.deviceTokenTtlMs).toISOString()
        : null;

    const device: DeviceRecord = {
      id: randomId(12),
      name: input.deviceName,
      tokenHash: hashToken(token),
      deviceSecretHash: input.deviceSecret ? hashToken(input.deviceSecret) : null,
      scopes: match.scopes && match.scopes.length > 0 ? [...match.scopes] : [...DEFAULT_DEVICE_SCOPES],
      createdAt,
      lastSeenAt: null,
      tokenExpiresAt,
      revokedAt: null,
      tokenRotatedAt: null,
    };

    await this.store.update((state) => {
      state.devices.push(device);
      const record = state.pairingCodes.find((c) => c.id === match.id);
      if (record) {
        record.consumedAt = createdAt;
        record.deviceId = device.id;
      }
    });

    this.log.info("Device paired.", { deviceId: device.id, name: device.name, remote });

    return {
      deviceId: device.id,
      deviceToken: token,
      serverId: this.store.data.serverId,
      serverName: this.config.name,
      apiVersion: API_VERSION,
      wsProtocolVersion: WS_PROTOCOL_VERSION,
      scopes: [...device.scopes],
      tokenExpiresAt,
    };
  }

  /** Resolve a bearer token to its active device, or null when unusable. */
  authenticate(token: string | null): DeviceRecord | null {
    if (!token) return null;
    const hash = hashToken(token);
    const device = this.store.data.devices.find((d) => hashedStringEqual(d.tokenHash, hash));
    if (!device) return null;
    if (device.revokedAt) return null;
    if (device.tokenExpiresAt && Date.parse(device.tokenExpiresAt) <= Date.now()) return null;

    const now = Date.now();
    const last = device.lastSeenAt ? Date.parse(device.lastSeenAt) : 0;
    if (now - last > LAST_SEEN_THROTTLE_MS) {
      device.lastSeenAt = nowIso();
      void this.store.save().catch((error: unknown) => {
        this.log.warn("Failed to persist last-seen timestamp.", { error: String(error) });
      });
    }
    return device;
  }

  deviceById(id: string): DeviceRecord | null {
    return this.store.data.devices.find((d) => d.id === id) ?? null;
  }

  listDevices(currentId?: string): DeviceSummary[] {
    return this.store.data.devices.map((d) => ({
      id: d.id,
      name: d.name,
      scopes: [...d.scopes],
      createdAt: d.createdAt,
      lastSeenAt: d.lastSeenAt,
      tokenExpiresAt: d.tokenExpiresAt,
      revokedAt: d.revokedAt,
      ...(currentId !== undefined ? { current: d.id === currentId } : {}),
    }));
  }

  async renameDevice(id: string, name: string): Promise<boolean> {
    const device = this.deviceById(id);
    if (!device) return false;
    await this.store.update(() => {
      device.name = name;
    });
    return true;
  }

  /** Revoke a device. Idempotent: revoking an unknown id is a no-op. */
  async revokeDevice(id: string): Promise<boolean> {
    const device = this.deviceById(id);
    if (!device) return false;
    if (!device.revokedAt) {
      await this.store.update(() => {
        device.revokedAt = nowIso();
      });
      this.log.info("Device revoked.", { deviceId: id });
    }
    return true;
  }

  /** Issue a fresh token for an active device, invalidating the previous one. */
  async rotateToken(id: string): Promise<{ token: string; tokenExpiresAt: string | null } | null> {
    const device = this.deviceById(id);
    if (!device || device.revokedAt) return null;

    const now = Date.now();
    const token = randomToken(32);
    const tokenExpiresAt =
      this.config.deviceTokenTtlMs !== null
        ? new Date(now + this.config.deviceTokenTtlMs).toISOString()
        : null;

    await this.store.update(() => {
      device.tokenHash = hashToken(token);
      device.tokenExpiresAt = tokenExpiresAt;
      device.tokenRotatedAt = nowIso();
    });

    this.log.info("Device token rotated.", { deviceId: id });
    return { token, tokenExpiresAt };
  }
}
