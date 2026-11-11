import type { PairRequest, PairResponse } from "@omp-console/protocol";
import type { Config } from "../config/index.js";
import type { Logger } from "../log/index.js";
import type { Store } from "../store/index.js";
import type { DeviceRecord } from "../store/types.js";
import { hashedStringEqual, nowIso } from "../util/time.js";
import { pairingCode, randomId, randomToken } from "../util/id.js";
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

const DEFAULT_SCOPES = ["read", "agent", "manage"];
const LAST_SEEN_THROTTLE_MS = 60_000;

export class AuthService {
  constructor(
    private readonly store: Store,
    private readonly config: Config,
    private readonly log: Logger,
  ) {}

  /**
   * Create a new pairing code if none is valid. Returns the plaintext code when
   * a new one was minted (caller decides how to surface it), else null.
   * When `config.pairingCode` is set (tests/dev), that code is used.
   */
  async ensurePairingCode(force = false): Promise<string | null> {
    const pairing = this.store.data.pairing;
    const now = Date.now();
    const expired = pairing.expiresAt !== null && pairing.expiresAt <= now;

    if (!force && pairing.codeHash && !expired) return null;

    const code = this.config.pairingCode ?? pairingCode(8);
    pairing.codeHash = hashToken(code);
    pairing.expiresAt =
      this.config.pairingCodeTtlMs > 0 ? now + this.config.pairingCodeTtlMs : null;
    await this.store.save();
    this.log.info("Pairing code issued.", { expiresAt: pairing.expiresAt });
    return code;
  }

  async pair(input: PairRequest, remote: string): Promise<PairResponse> {
    const pairing = this.store.data.pairing;
    const now = Date.now();
    if (!pairing.codeHash) {
      throw new AuthError(401, "unauthorized", "No pairing code is active. Generate one on the server.");
    }
    if (pairing.expiresAt !== null && pairing.expiresAt <= now) {
      throw new AuthError(401, "unauthorized", "The pairing code has expired. Generate a new one on the server.");
    }
    if (!hashedStringEqual(hashToken(input.code), pairing.codeHash)) {
      throw new AuthError(401, "unauthorized", "Invalid pairing code.");
    }

    const token = randomToken(32);
    const device: DeviceRecord = {
      id: randomId(12),
      name: input.deviceName,
      tokenHash: hashToken(token),
      deviceSecretHash: input.deviceSecret ? hashToken(input.deviceSecret) : null,
      scopes: [...DEFAULT_SCOPES],
      createdAt: nowIso(),
      lastSeenAt: null,
    };

    await this.store.update((state) => {
      state.devices.push(device);
      // Single use: invalidate the consumed code.
      state.pairing.codeHash = null;
      state.pairing.expiresAt = null;
    });

    this.log.info("Device paired.", { deviceId: device.id, name: device.name, remote });

    return {
      deviceId: device.id,
      deviceToken: token,
      serverId: this.store.data.serverId,
      serverName: this.config.name,
      apiVersion: 1,
      wsProtocolVersion: 1,
    };
  }

  authenticate(token: string | null): DeviceRecord | null {
    if (!token) return null;
    const hash = hashToken(token);
    const device = this.store.data.devices.find((d) => hashedStringEqual(d.tokenHash, hash));
    if (!device) return null;

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

  listDevices(): Array<Pick<DeviceRecord, "id" | "name" | "createdAt" | "lastSeenAt" | "scopes">> {
    return this.store.data.devices.map((d) => ({
      id: d.id,
      name: d.name,
      createdAt: d.createdAt,
      lastSeenAt: d.lastSeenAt,
      scopes: d.scopes,
    }));
  }

  async revokeDevice(id: string): Promise<boolean> {
    let removed = false;
    await this.store.update((state) => {
      const before = state.devices.length;
      state.devices = state.devices.filter((d) => d.id !== id);
      removed = state.devices.length !== before;
    });
    return removed;
  }
}
