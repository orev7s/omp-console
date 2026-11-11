# OMP Console

Run and control Oh My Pi (`omp`) coding agents on your own VPS from a phone-sized
UI in the browser or, later, an Android app.

OMP Console is two pieces: a Node.js control plane that runs on the VPS, and a
React Native UI that builds for the browser today and for Android when the APK
ships. The browser build is the primary client and the acceptance surface. It
is mobile-first, not a desktop dashboard.

## Status

- Phase 1, connectivity foundation: done. The browser client is served over
  HTTPS with a publicly trusted certificate and passes pairing, health, WSS,
  echo, server events, and reconnect after a control-plane restart.
- Phase 2, installer and onboarding: in progress. Domain and HTTP modes are
  verified on a real VPS, including rerun, uninstall, and fresh reinstall.
  IP-only needs public port 80, which the current host refuses. arm64 and musl
  are untested.
- Phases 3 to 9 are not started. See `roadmap.md`.

The live reference instance is `https://13-63-44-162.sslip.io` on a VPS, with a
Let's Encrypt certificate from `sslip.io`. It is a test instance, not a service
with a support contract.

## How it works

```
Browser (same-origin UI and API)
    | HTTPS + WSS
Caddy (TLS, trusted certificate, static UI, reverse proxy)
    | loopback plaintext
Control plane (Node.js, systemd): auth, HTTP API, WebSocket hub, store
    | local Unix socket (L2, Phase 4)
Agent host (owns omp children, Phase 4 and later)
```

The app talks only to the L1 API. It never sees `omp`, its RPC frames, or any
process concept. The control plane never spawns `omp`. The agent host will be
the only component that knows Oh My Pi. See `spec.md`.

## Quick start

One command on the VPS, from GitHub:

```sh
curl -fsSL https://raw.githubusercontent.com/orev7s/omp-console/main/installer/bootstrap.sh \
  | sudo bash -s -- --mode domain --domain console.example.com \
      --email you@example.com --yes
```

Or clone and run the installer directly:

```sh
git clone https://github.com/orev7s/omp-console.git
cd omp-console
sudo ./installer/install.sh --mode domain --domain console.example.com \
  --email you@example.com --yes
```

The installer detects the platform, installs Node 26 (24 fallback), installs
`omp`, builds the control plane and browser UI, configures Caddy, installs the
systemd units, starts everything, runs health checks, and prints a one-time
pairing code. It is idempotent: rerun it to update in place.

Then open the URL it prints, enter the server address and pairing code, and you
are in.

### Connection modes

| Mode | Use when | Needs |
| --- | --- | --- |
| `domain` | You have a DNS name. Recommended. | A record pointing here, TCP 80 and 443 reachable. |
| `ip` | You only have a public IPv4. | Public TCP 80. Caddy 2.10.1 or newer, installed by the installer. |
| `private` | Tailscale or WireGuard. | A private hostname; HTTPS enabled for the tailnet. |
| `http` | Last resort, explicit. | Nothing. Traffic and credentials are unencrypted. |

HTTPS is the default. HTTP is never automatic and never a silent fallback.

See `installer/README.md` for every flag, path, and mode detail.

## Repository layout

```
packages/protocol/    L1 Zod schemas and types
apps/backend/         control plane: HTTP, WebSocket, auth, store
apps/android/         React Native app and the browser build
  web/                Vite entry for the browser build
  src/                features, api, realtime, state, storage, ui
installer/            install.sh, uninstall.sh, doctor.sh, caddy, systemd
docs/decisions/       ADRs
docs/phase-reports/   phase evidence and honest status
spec.md               architecture and product vision
roadmap.md            phases and current status
design.md             UI system
AGENTS.md             rules for contributors and coding agents
```

## Development

```sh
npm install
npm run build          # protocol and backend
npm test               # protocol build + backend tests
npm run typecheck
npm run dev            # control plane on 127.0.0.1:8722
```

Browser build and end-to-end run:

```sh
cd apps/android
npm ci
npm run build:web      # writes web/dist
npm run e2e:web        # backend + Caddy + Playwright over HTTPS and WSS
npm test               # Jest
npm run typecheck
```

The end-to-end run uses Caddy's local CA over `https://localhost:8443`. On the
VPS, run the same flow against the public certificate before claiming the TLS
path works.

## Security

- TLS is terminated by Caddy with a publicly trusted certificate. The control
  plane binds loopback and speaks plaintext only there.
- Tokens are per device and revocable. The pairing code is single use.
- The service runs as a dedicated user with a hardened systemd unit. Config is
  0600, data is 0700.
- Direct HTTP is opt-in only, with a warning and no automatic downgrade.
- Known risk: the browser build keeps the device token in `localStorage`. Move
  it to an HttpOnly cookie or an in-memory token before a public release. This
  is tracked in the roadmap and ADR 0005.
- The official `omp` installer is a remote script. The installer downloads it,
  prints its SHA256, and runs it only after confirmation or `--yes`.
- Never commit secrets, keystores, `.env` files, or build output.

## Docs

- `spec.md`: architecture, protocol layers, process model, security.
- `roadmap.md`: phases 1 to 9 and current status.
- `AGENTS.md`: contribution and coding rules.
- `installer/README.md`: install, modes, doctor, uninstall.
- `docs/decisions/`: ADRs.
- `docs/phase-reports/`: what was verified and what was not.

## License

MIT. See `LICENSE`.