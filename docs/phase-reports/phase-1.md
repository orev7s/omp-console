# Phase 1 status report

Status: Done. The browser build is the acceptance surface, served over HTTPS
with a publicly trusted certificate from a real VPS.

Date: 2026-11-11
Host: VPS at `13.63.44.162`, Ubuntu 26.04, amd64, glibc, Node 26.13.1.

## Delivered

- `packages/protocol`: L1 contract (REST and WebSocket Zod schemas, version
  constants, error envelope, agent state, connection modes).
- `apps/backend`: the control plane. HTTP (`/v1/health`, `/v1/meta`,
  `/v1/pair`), WebSocket hub (Bearer and cookie-friendly upgrade auth, hello,
  echo, ping/pong, topic subscribe to `server.status`, heartbeat, slow-consumer
  disconnect), pairing with per-device hashed tokens, rate limiting, redacting
  logger, atomic JSON store, loopback-by-default bind with an explicit
  insecure-HTTP flag, graceful shutdown, and a hardened systemd unit.
- `apps/android`: bare React Native 0.88.1, TypeScript, and the same UI built for
  the browser. Onboarding (Welcome, Connect, Pair, Home, Debug), four connection
  modes, the design system, keychain storage on Android, and a browser build
  used as the no-install surface.
- `installer/caddy`: the domain, IP, and local Caddy fronts, plus the README for
  all four connection modes.
- `installer`: the Phase 2 installer, uninstaller, and doctor (see the Phase 2
  report). Phase 1 used the Caddy front and the control plane built by it.

## Verified (executed)

- Backend `tsc --noEmit`: clean.
- Backend tests on Node 26.13.1: 26 passed, 0 failed. The new cases cover reused
  and expired pairing codes, the pairing rate limit, oversized bodies, the
  internal-error envelope, connection-mode defaults and the public-bind refusal,
  reconnect cleanup and re-subscription, heartbeat disconnect, and slow-consumer
  disconnect.
- Protocol build: succeeded.
- Android `tsc --noEmit`: clean.
- Android Jest: 17 passed.
- Public browser end to end, twice: the real UI at
  `https://13-63-44-162.sslip.io`, served by Caddy, paired, connected, passed
  health and meta over HTTPS, opened WSS, received the hello and
  `server.status`, and completed the echo round trip. The certificate is Let's
  Encrypt (`issuer=Let's Encrypt`, valid to 2027-02-09). No verification was
  disabled.
- Reconnect: with the browser connected, `systemctl restart omp-console` was
  run. The client reconnected, re-subscribed, and logged a second hello.
- Android release APK: built earlier, not rebuilt for this close-out. The APK is
  deferred by product decision.

## Deferred by decision

- The Android APK and Android device testing. The browser is the acceptance
  surface; the APK is rebuilt after the web version is finished. Native paths
  (Keystore, the Android WebSocket, the Android TLS stack) remain unproven.

## Residual risks

- The web build keeps the device token in `localStorage`. A public deployment
  should move to an HttpOnly cookie or an in-memory token. Recorded in ADR 0005
  and the testing rules.
- A browser restart or reload keeps the token only because of localStorage. The
  cookie change will also change how a reload restores the session.
- The APK has no current artifact after the UI redesign. It is not used for the
  acceptance test.

## How to verify

1. Open `https://13-63-44-162.sslip.io`.
2. Enter the address `13-63-44-162.sslip.io` on Connect. Secure mode is the
   default.
3. Pair with a code minted on the server (see `installer/README.md`). Home
   should show connected, and Debug should show the hello, `server.status`, and
   the echo.
4. Restart `omp-console` and confirm the client reconnects and logs a second
   hello.

## Open follow-ups

- Web token storage (cookie or in-memory) before a public release.
- Android native testing when the APK is rebuilt.
- A publicly trusted certificate is verified for the domain path. The IP-only
  path still needs public port 80, which this host currently refuses. See the
  Phase 2 report.