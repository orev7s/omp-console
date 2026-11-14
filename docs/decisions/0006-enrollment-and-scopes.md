# 0006 - Device enrollment, scopes, and credential lifecycle

Status: Accepted (Phase 3, in progress)

## Context

Phase 1 pairing issued one token per device from a single global pairing code
stored in one slot. Every device received the same scopes (`read`, `agent`,
`manage`). Revocation deleted the device record, but an already-open WebSocket
kept running, and tokens never expired or rotated. Phase 3 must make enrollment
production-grade: multiple devices, per-device permissions, immediate
revocation, rotation, expiry, and short-lived single-use codes.

## Decision

- Pairing codes are stored as records, hashed, short-lived (default 30 minutes,
  configurable), and single-use. Consuming a code marks it consumed rather than
  deleting it, so the record of which device used which code survives. At most
  five records are kept, with a seven-day retention window.
- A device may be granted any subset of `read`, `agent`, `manage`. New devices
  default to all three. Scopes are enforced at one place for REST (route option,
  checked before the handler) and one place for WebSocket (topic scope map).
- Revocation is a soft delete: `revokedAt` is set, the token hash is retained for
  audit, and `authenticate` refuses revoked devices. The revoke route also calls
  the WebSocket hub to close live sockets for that device immediately.
- Token rotation issues a fresh random token and replaces the hash in place, so
  the previous token stops working at once. Rotation requires `manage`.
- Device token expiry is supported via `deviceTokenTtlMs`. It defaults to off
  (null) so an install cannot lock a user out of re-pairing, and can be enabled
  by configuration.
- Pairing has its own rate limiter, capped tighter than the general limiter
  (ten attempts per window by default) because it is the one endpoint an
  unauthenticated attacker can drive.

## Alternatives

- Keep deleting device records on revoke. Rejected: loses audit trail and makes
  "already revoked" indistinguishable from "unknown device".
- Store pairing codes in plaintext to allow reprinting. Rejected: a leaked state
  file would hand over live codes. The installer prints a code once.
- Enforce scopes only at REST. Rejected: a live WebSocket would bypass them for
  the life of the connection.
- Default token expiry on. Rejected for now: without a full automatic re-pair
  flow, expiry is a lockout risk. Rotation and revocation cover the threat.

## Consequences

- Store schema moves to v2. A v1 file migrates in place; the single legacy
  pairing code is dropped because its plaintext is unrecoverable, so the
  operator mints a fresh code.
- The app must treat `403 forbidden` as a scope problem distinct from `401`.
- Rotating a token requires the caller to persist the returned token; the old one
  is dead immediately.
- Narrowing a device below `read` makes the app's normal connect flow fail at
  `meta`, which is intended but must be explained in the UI later.