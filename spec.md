# OMP Console - Technical Specification

Status: Living document. Phases 1 to 4 are implemented, and Phase 5 (agent
sessions and the live run view, including the session-first shell) is in
progress; `roadmap.md` is the source of truth for phase status.
Project name: OMP Console (repository `omp-console`). Confirmed by the reviewer.

This document describes the complete intended product and separates what ships
in Phase 1 from what is planned later. See `roadmap.md` for the incremental plan
and `AGENTS.md` for the rules agents must follow.

---

## 1. Purpose and scope

OMP Console is a coding environment. It is not a chat app, a passive console, or
a general-purpose dashboard. The product exists to run Oh My Pi (`omp`) coding
agents on real projects on a server the user owns, and to let them watch and
steer that work from a phone. Chat is how you drive the agent, not the point.
Monitoring, files, and the terminal are supporting tools for the same job.

OMP Console is an Android application plus a small VPS service that let a person
run and control Oh My Pi (`omp`) coding agents on their own server from a phone,
without needing to be a Linux expert.

The Android app is a client. It renders UI, talks to the VPS service over HTTP
and WebSocket, keeps local state and credentials, and displays live agent output
and server health. It never talks to `omp` directly and holds no agent logic.

The VPS side has two cooperating processes:

- The control plane ("the backend" from the app's view) serves the HTTP and
  WebSocket API, authenticates devices, sits behind the TLS front, and reports
  health. It owns no agent process and knows nothing about `omp`.
- The agent host owns every `omp` process and speaks Oh My Pi's RPC protocol,
  exposing a small local-only interface to the control plane.

Keeping these separate is what lets the control plane restart freely without
restarting the agents (section 12).

### In scope (full product)

- One-command installation and configuration on a supported Linux VPS.
- Secure pairing of one or more Android devices to a server, with revocation.
- A stable HTTP and WebSocket API between the app and the backend.
- Oh My Pi integration through its documented RPC interface.
- Agent session management, real-time chat and event streaming.
- Process supervision with crash detection and recovery.
- VPS monitoring: CPU, RAM, disk, network, and service health.
- Project and file management, and terminal access.
- Logs and errors a non-expert can act on.

### Out of scope (explicitly)

- A model gateway, or storing or proxying model provider keys. `omp` owns
  provider credentials. We may surface its login flow later, nothing more.
- Replacing the `omp` CLI or reimplementing its agent loop.
- Running the backend on Windows. Server support is Linux first.
- Rust or Go components until a measurable requirement justifies them.

### Phase 1 scope (historical)

Phase 1 proved the communication foundation: the app connects to a real control
plane on a VPS over HTTPS and WSS, verifies health, exchanges messages, shows
connection state, and handles failure and reconnect. No agent integration, no
agent host, no monitoring, no file or terminal features.

---

## 2. Target user and product goals

The user has a VPS and wants to drive coding agents from a phone. They may or may
not be comfortable with a terminal; the product assumes neither.

Goals, in priority order: reliable (the control plane stays up when the agent
does not), secure by default (no unauthenticated remote control, HTTPS unless
the user explicitly opts into HTTP), easy to install (one command, idempotent,
clear errors), maintainable (few well-bounded components, one language), and
extensible (the agent runtime stays replaceable behind a stable boundary).

---

## 3. System architecture

Three tiers. The app depends only on our public API. The control plane depends on
the agent host through one local interface. Only the agent host knows `omp`.

```
 Android app (React Native, TypeScript)
   UI + client state + REST/WS clients + secure storage
        │ HTTPS + WSS (default) or HTTP (explicit opt-in)
        ▼
 Caddy (HTTPS: domain or Let's Encrypt IP cert), or direct HTTP (mode 1)
        │ loopback for HTTPS, or explicit public bind for HTTP
        ▼
 Control plane (Node.js, systemd): HTTP API, WebSocket hub, auth,
 store, monitoring. Knows no OMP, holds no agent state.
        │ local Unix socket (L2 protocol)
        ▼
 Agent host (Node.js, systemd): session manager, process supervisor,
 OMP RPC client, event translation. The only OMP owner.
        │ spawn + NDJSON over stdin/stdout
        ▼
 omp children (omp --mode rpc), one per active session
```

Three independent protocol layers (section 10): L1 the app-facing API (ours,
stable, versioned); L2 the internal control-plane to agent-host protocol (ours,
local-only, versioned); L3 Oh My Pi's RPC (confined to the agent host). The app
must never depend on L2 or L3.

---

## 4. Technology choices and justification

### 4.1 Android application

React Native (Community CLI, no Expo) with TypeScript. This is the required
stack. Design notes:

- React Navigation for navigation.
- State: a small client store (Zustand) for connection and UI state, plus a
  server-state cache (TanStack Query) for REST data and retries.
- A hand-written WebSocket client over the platform WebSocket, because we need
  custom reconnect, subscribe, and replay behavior.
- Parse every network payload with the shared Zod schemas so a backend change
  cannot silently corrupt app state.
- Secrets (device token) go in the Android Keystore via `react-native-keychain`.
  Non-secret preferences go in `@react-native-async-storage/async-storage`.
- Builds use Gradle directly (`./gradlew assembleDebug` or `assembleRelease`),
  so the app builds locally on a build host with the Android SDK.
- TLS is ordinary platform validation of publicly trusted certificates. Because
  the server presents a trusted certificate (section 11), the app needs no
  custom pinning and no self-signed acceptance. The one non-TLS mode is direct
  HTTP (mode 1), which the user must select explicitly and which is clearly
  labeled as insecure.
- UI is built on a token layer (color, spacing, typography, radius, elevation)
  with light and dark themes, so the visual system is customizable without
  touching screens.

### 4.2 Backend runtime: Node.js 26 LTS (decision D1)

Researched facts:

- The Oh My Pi SDK (`@oh-my-pi/pi-coding-agent`) is a Bun package, documented as
  "not a Node.js SDK". It requires Bun (docs cite both 1.3.14 and 1.4.4; the
  installer enforces 1.4.4) and shares the host process.
- Oh My Pi's RPC mode (`omp --mode rpc`) is runtime independent: a custom
  newline-delimited JSON protocol over stdin/stdout, with clients shipped in
  TypeScript, Python, Rust, and Go. It is recommended for "non-Node embedders,
  or when you want process isolation".
- Oh My Pi installs as a self-contained prebuilt binary by default (no Bun at
  runtime). Bun is only required for the `--source` install path.

Decision: both Node services target Node.js 26 LTS. Node.js 24 LTS is the
fallback if a dependency or integration test does not support 26. Do not pin to
Node 22 without a specific compatibility reason. Bun stays a documented
alternative, not the default.

Reasons for Node over Bun as the default:

- We must keep the agent process isolated from the management service. The
  in-process SDK would put `omp` in the backend's failure and memory boundary,
  which breaks a hard requirement. RPC gives us a real process boundary.
- Because we choose RPC, we are not forced onto Bun, and Node LTS is the most
  reliable, most widely available runtime for a long-running VPS daemon.
- Node LTS provides `fetch`, `node:test`, ESM, and `AbortController` built in.
  The only heavyweight runtime dependency is a WebSocket server library.

Bun remains attractive (built-in HTTP, WebSocket, SQLite, Argon2; same runtime
family as `omp`; keeps the SDK door open) and is recorded as a reversible choice.

Verification required in Phase 1 before the choice is locked: the target major
must run `ws`, `zod`, and the standard-library features we use, and the backend
and protocol tests must pass on it. This host has Node 22.22.1, so Phase 1 must
install Node 26 (or 24) and run the suite there. The result is recorded as an ADR.

Library set (kept deliberately small): `node:http` for HTTP and to own the
WebSocket upgrade; `ws` for the WebSocket server (Node has no built-in WS
server); `zod` for validation, shared with the app and across L2; TypeScript ESM,
`tsx` for development, `tsc` for the production build; `node:test` for tests. No
web framework initially; a thin internal router keeps magic and dependencies low.

### 4.3 Oh My Pi integration: RPC over stdio, owned by the agent host (D2)

We use `omp --mode rpc` as a supervised child process. We do not use the SDK.

Reasons:

- Process isolation is required. The brief states restarting Oh My Pi must not
  restart the management service, and the management service must survive an
  agent crash. A child process gives us that directly; the SDK does not.
- RPC is the path Oh My Pi's own production service (`robomp`) uses, and the
  path a comparable third-party project (`KenDJohnson/omp-remote`) uses to
  supervise `omp --mode rpc` behind an authenticated WebSocket.
- We implement our own thin, typed RPC client rather than depending on the
  Bun-only package. The protocol is documented, a wire schema is published, and
  four client implementations exist, which signals a supported boundary. Our own
  client avoids an ~800 MB dependency tree on the VPS and keeps the runtime
  portable.

Because the control plane must be independently restartable without restarting
OMP, the `omp` children are owned by a separate long-lived agent host, not by the
control plane. The full process model is section 12.

Integration obligations (all inside the agent host):

- Spawn and supervise `omp`, parse the `ready` frame, negotiate protocol v2 when
  advertised, and reassemble `rpc_chunk` frames.
- Correlate command responses by `id`. Responses and events may interleave and
  arrive out of order; we never assume ordering.
- Translate OMP events into our L2 event model so nothing above L3 sees OMP
  frame shapes.
- Never parse stderr as protocol. stdout is the protocol channel; stderr is
  diagnostics.
- Apply timeouts, cancellation, and backpressure so a slow app cannot stall the
  agent and a stuck agent cannot stall the control plane.

Explicit non-assumptions (OMP does not currently support these, so we must not
build on them):

- There is no general-purpose remote-control HTTP or WebSocket API in `omp`
  today. An opt-in `--mode rpc --http` transport exists only as an unmerged
  proposal (PR #9849). We treat the stdio child as the only supported path and
  keep the agent host's transport swappable so a future HTTP transport can be
  adopted without changing L2 or L1.
- The RPC `login` command cannot complete interactive secret prompts. Prompts
  marked secret are rejected with a message directing the user to the terminal,
  so provider OAuth for `omp` may require terminal access in early phases (R3).
- `pi-wire` and the collab relay are for live session sharing, not remote agent
  control. Out of scope.

### 4.4 Shared protocol packages

- `@omp-console/protocol`: Zod schemas and inferred types for every L1 REST
  payload and WebSocket frame, plus version constants. Imported by the app, the
  control plane, and the agent host where relevant.
- `@omp-console/agent-protocol`: Zod schemas and types for the internal L2
  protocol between the control plane and the agent host. Local-only. Phase 4.

Both have no runtime dependencies beyond Zod.

### 4.5 Network front and connection modes (decisions D8, D9)

Caddy is the default TLS reverse proxy. The Node backend binds to loopback and
speaks plaintext only on `127.0.0.1`. Caddy terminates TLS with a publicly
trusted certificate and forwards to the backend. This is the default because
certificates are automatic and trusted, so the app needs no custom trust
handling, and keeping the backend on loopback leaves no hand-built network
surface to secure.

Four connection modes are supported, selected per server:

1. Direct HTTP using the VPS IP or host. Disabled by default. Requires explicit
   user selection and confirmation. Authentication credentials and all traffic
   are unencrypted and can be intercepted. This mode exists for users who have
   only a public IP and do not want a domain or a certificate.
2. HTTPS with a publicly trusted Let's Encrypt IP certificate through Caddy.
3. HTTPS with a domain and publicly trusted certificate through Caddy.
4. HTTPS through a private network such as Tailscale or WireGuard.

HTTPS is the default and recommended. HTTP is never selected automatically and
is never used as a silent fallback (section 11). Users may change the mode later
without re-pairing.

The app UI is mobile-first. The same screens also build for the browser and are
served by Caddy at the same origin as the API, so the console can be used without
installing the APK or running an emulator. The browser build is not a separate
product surface; it exists for no-install access and for the end-to-end test.

Certificate and network paths:

- Domain (mode 3): the user points an A/AAAA record at the VPS and opens ports
  80 and 443. Caddy obtains and renews a publicly trusted certificate
  automatically.
- Bare IP (mode 2): Let's Encrypt IP address certificates reached general
  availability on January 15, 2026 and Caddy supports them (since 2.10.1) with
  the `shortlived` profile and the HTTP-01 challenge. Constraints: the
  certificate is short-lived (~6 days) and must auto-renew (Caddy handles this),
  port 80 must be reachable from the public internet, the IP must be public and
  not behind NAT without port forwarding, TLS-ALPN must be disabled for IP
  subjects, and clients reaching a bare IP may omit SNI, so `default_sni` must be
  set. IPv6 IP certificates needed a recent Caddy; verify the installed version.
- Private network (mode 4): users who cannot expose ports or use a public IP
  run over Tailscale or WireGuard. Caddy can obtain trusted certificates for a
  `*.ts.net` name from the local Tailscale instance, so this path is also
  trusted.
- Direct HTTP (mode 1): the control plane binds the configured interface instead
  of loopback, only when the operator explicitly enables it, and logs a loud
  startup warning. The app requires explicit selection and shows a persistent
  warning while connected this way.

---

## 5. Component responsibilities

Android app: screens and navigation; connection management (configure address,
pair, connect, reconnect); realtime subscription lifecycle; local state and
preferences; secure credential storage; presentation of agent output, health,
sessions, files, and terminal. No agent logic, no `omp` knowledge, no direct
server access except our API.

Control plane: TLS front integration; authentication (pairing, per-device
tokens, scopes, revocation); HTTP API; WebSocket hub; persistence for devices,
sessions metadata, settings; server monitoring; an L2 client of the agent host.
It never spawns `omp` and never sees OMP frame shapes; it keeps working when the
agent host is down.

Agent host: the only component that knows `omp`. Modules: `supervisor` (start,
stop, restart, observe `omp`; track `stopped`/`starting`/`ready`/`busy`/`crashed`;
apply restart backoff), `rpcClient` (framing, correlation, event decode, v2 chunk
reassembly, timeouts, cancellation), `sessionManager` (create, open, list,
switch; own the map from our session id to the `omp` process and session file;
enforce single ownership), `eventMapper` (OMP events to the L2 model),
`capabilities` (probe `omp` version and protocol versions).

---

## 6. Android application architecture

Layering, outside in:

- `app/` (navigation): the navigator and screen registration only.
- `features/`: one folder per feature (`onboarding`, `connect`, `pair`,
  `devices`, `sessions`, later `monitor`, `files`, `terminal`). Each owns its
  screens, hooks, components.
- `realtime/`: WebSocket client, reconnect state machine, subscriptions,
  sequence/replay handling.
- `api/`: typed REST client built on `packages/protocol`.
- `state/`: stores (connection, server info, sessions) and selectors.
- `storage/`: secure storage wrapper and preferences.
- `ui/`: theme tokens, primitives, shared components.

Rules: screens read state and dispatch intents, with no networking in
components; all payloads validated at the boundary, no `any` crossing a network
edge; reconnect and backoff live in one place; no feature imports another
feature's internals. The connection screen owns mode selection (HTTPS default;
HTTP opt-in behind an explicit confirmation and a persistent warning) and stores
the chosen mode per server, and nothing downgrades the scheme automatically.

The shell (Phase 5, ADR 0008) is session-first. The `Sessions` landing groups
recent sessions by recency (Today, Yesterday, Earlier) and shows the project
folder per row; the `Session` route renders the active tab. Open sessions are kept
in an in-app tab strip (horizontal and scrollable on a phone), and the tab set and
active tab are app state in the session store, not router state. The run view
streams the active session's transcript: assistant text renders as Markdown
(paragraphs, headings, lists, fenced code, links, bold, italic, and inline code),
user messages render in a sunken bubble, other non-assistant frames render as a
muted mono block, and thinking and tool calls sit in collapsible blocks,
collapsed by default, with
plain-word headers (`Thought`, `Ran bash`, `Tool read`), the tool status shown as
a word inside, and the disclosure shown as the word Show or Hide rather than a
glyph. Server details, Devices, Connection, and Activity move into a settings
sheet, and connection status shrinks to a compact live element in the shell
chrome. The app ships no icon set beyond the brand mark and the abstract
functional glyphs; rows, tabs, and actions are labeled with words. There is no
project rail in Phase 5: the OpenCode rail is project-based and needs the project
registry (Phase 7), so the landing is the selector until then.

The visual system is specified in `design.md` and implemented in `src/ui/theme`
(tokens) and `src/ui/components` (primitives). Screens in `src/features/` read
semantic tokens only. On device, navigation is React Navigation native-stack;
the browser end-to-end harness uses a small platform navigator instead, because
`react-native-screens` does not lay out under `react-native-web` (ADR 0004).
Screens depend only on the shared `AppNavigation` contract, so the two navigators
are interchangeable.

---

## 7. Backend architecture

Control plane layering: `http/` (router, handlers, middleware), `ws/` (upgrade,
connection registry, topic hub, dispatch, heartbeat), `auth/` (pairing, device
registry, tokens, scopes, revocation), `agenthost/` (the L2 client; the only
place that talks to the agent host), `monitor/` (metrics, health), `store/`
(atomic persistence), `config/` (defaults, file, environment), `log/`
(redacting), `util/`.

Agent host layering: `supervisor/`, `rpc/`, `sessions/`, `events/`, `server/`
(L2 Unix socket server), `config/`, `log/`, `util/`.

Constraints: the agent host is the only place that spawns processes or reads OMP
frames; the control plane depends on it only through L2, never through raw frames
or process handles; errors map to one envelope at the edge and internal details
never reach a client; the control plane survives the agent host being down, with
HTTP, auth, and monitoring still working and agent state reported as down.

### 7.1 Persistence

Phase 1 stores devices and settings in a JSON file with atomic replace (temp
file, fsync, rename). This avoids a database dependency for a tiny dataset. Move
to SQLite when sessions, audit logs, or metric history justify it (Phase 6). Use
Node's built-in SQLite if it is stable in the target LTS then; otherwise a small
embedded driver.

### 7.2 Configuration

Defaults in code, overridable by a config file (`/etc/omp-console/config.json` or
`$HOME/.config/omp-console/config.json`), overridable by environment variables.
The installer writes the initial config. Bind address (loopback by default),
port, data directory, the agent host socket path, and the `omp` binary path are
configurable. TLS is Caddy's concern.

---

## 8. Installation and onboarding

Goal: one command on the VPS, then pair from the phone.

Phase 2 ships a source-based installer. Clone the repo on the VPS, then run
`sudo ./installer/install.sh --mode domain|ip|private|http`. A hosted one-liner
and automatic app-driven enrollment are later onboarding work.

1. User installs and opens the app.
2. The app shows one command (and a deep link) to run on the VPS.
3. The installer: detects OS and architecture (and glibc vs musl); verifies a
   supported Node.js LTS, installing it if needed; installs or verifies `omp`
   (official installer); installs the control plane and the agent host; lets the
   user pick a connection mode and configures accordingly (direct HTTP by IP, or
   Caddy with a domain certificate, a Let's Encrypt IP certificate, or a private
   network); for the HTTPS modes checks that ports 80 and 443 are open and DNS
   points at the server, and for HTTP mode warns and requires explicit
   confirmation; writes configuration and pairing material; installs and starts
   the systemd units with restart-on-failure; runs health checks and reports a
   clear result; prints the pairing code or URL and the server address.
4. User enters the pairing code in the app (or opens the deep link).
5. App and backend establish an authenticated session (HTTPS and WSS by default,
   or HTTP if the user explicitly chose it).

Installer requirements: idempotent and safe to rerun, detecting existing installs
and updating in place; support common Linux VPS distributions and `x86_64` and
`arm64`; handle all four connection modes and explain what each requires (a DNS
record, open ports, a private network, or an explicit insecure HTTP choice); fail
loudly with actionable messages and never leave a partial config; secure by
default (least privilege, systemd hardening, no secrets in shell history or
world-readable files); provide an uninstall path and a diagnostics command.

Future onboarding: a one-command enrollment where the installer registers with a
hosted broker or prints a short-lived, single-use token the app consumes
automatically. The connection system is built around revocable, per-device
credentials from the start, so this is additive.

---

## 9. API architecture

Resource-oriented JSON over HTTPS, versioned by path prefix (`/v1/`).

Conventions: auth via `Authorization: Bearer <device-token>` for everything
except liveness and the pairing exchange; every response is a success body or the
standard error envelope `{ error: { code, message, details?, retryable? } }` with
stable machine-readable `code` strings; server time and a request id on every
response; cursor-based pagination where lists can grow; strict `zod` validation
rejecting unknown fields where practical; version negotiation that rejects
unsupported versions with a clear error.

Implemented endpoint groups (as of Phase 5): `GET /v1/health` (unauthenticated
liveness and minimal info); `GET /v1/meta` (authenticated capabilities and `omp`
version); `POST /v1/pair`; `GET /v1/devices`, `PATCH /v1/devices/:id`,
`DELETE /v1/devices/:id`, `POST /v1/devices/:id/rotate`; `GET /v1/projects`,
`POST /v1/projects`, `DELETE /v1/projects/:id`; `GET /v1/sessions`,
`POST /v1/sessions`, `GET /v1/sessions/:id`, `POST /v1/sessions/:id/prompt`,
`POST /v1/sessions/:id/abort`, `GET /v1/sessions/:id/messages` (cursor and
`limit`), `GET /v1/sessions/:id/models`, `POST /v1/sessions/:id/model`,
`POST /v1/sessions/:id/thinking`, `GET /v1/sessions/:id/stats`,
`POST /v1/sessions/:id/steer`, `POST /v1/sessions/:id/follow-up`.

Scopes: reads (meta, device list, project list, session list, session detail,
models, stats, messages) require `read`; `POST /v1/sessions`, prompt, abort,
model, thinking, steer, and follow-up require `agent`; device and project
changes require `manage`. Agent-dependent routes return a retryable 503
`agent_unavailable` when the agent host is not connected.

Not yet built: `GET /v1/metrics/current` and `GET /v1/logs` (Phase 6), and
`GET /v1/files` (Phase 7). Anything streaming or long-lived uses WebSocket, not
polling.

---

## 10. Protocol separation

Three layers, deliberately independent:

- L1, public API: what the app speaks. Ours, stable, versioned by path, defined
  in `@omp-console/protocol`.
- L2, control-plane to agent-host: ours, local-only over a Unix socket,
  versioned, defined in `@omp-console/agent-protocol`. Not reachable from the
  network.
- L3, Oh My Pi RPC: newline-delimited JSON over stdio, confined to the agent
  host.

Rules: the app never sees L2 or L3 (no OMP names, frame types, or process
concepts in the L1 contract or app code); the control plane never sees L3 and
speaks L2; the agent host is the only translator. Changing the agent runtime or
its protocol changes L3 and the agent host's internals, not L1 or L2's shape.

### WebSocket event architecture (L1)

Endpoint `WSS /v1/ws`, authenticated on the upgrade with the device token in the
`Authorization` header. Never a query string, which leaks into logs. Browser
clients, which cannot set headers on a WebSocket upgrade, may instead carry the
token as a `bearer.<token>` subprotocol; header auth takes precedence.

- One connection per device, multiplexed across topics.
- Inbound frames are commands with an optional `id`. Outbound frames are
  responses (echoing `id`) or events.
- Envelope `{ v, type, id?, ts, ...payload }`. Every frame carries the protocol
  version `v`; unknown `type` values are ignored, not fatal.
- Topics today: `server.status`, `agent.status`, and `session:<id>.events` for
  each open session. A client subscribes to what it needs, so the backend sends
  only subscribed events and multi-device traffic stays bounded. `agent.status`
  carries the agent-level state plus the session list, so a session change is a
  status change for every subscriber. A session topic carries that session's
  normalized events (assistant text, thinking, tool execution, turn and retry
  lifecycle, and `queue.update` for the pending prompt depth). Session topics
  are scope-gated on `read`. `server.metrics` and `server.logs` arrive with
  monitoring (Phase 6).
- Events carry a per-topic sequence number. A bounded replay buffer for resume
  is not built yet: a reconnecting device re-subscribes and refetches durable
  history (transcripts) from REST, not from replay.
- Heartbeat ping/pong with idle timeout to detect half-open connections.
- Backpressure: per-connection outbound queues with limits; a slow device is
  disconnected rather than allowed to stall the agent or grow memory.
- Errors use the same envelope as REST, so the app has one error path.

The app realtime client is a state machine: `idle -> connecting -> connected ->
reconnecting -> idle`, with backoff and jitter, re-subscribing on reconnect and
requesting resume points.

### L2 internal protocol (control plane to agent host)

Transport is a Unix domain socket under the runtime directory, mode `0600`, owned
by the service user, never bound to a network interface. Shape is a local,
versioned request/response plus a server-initiated event stream, mirroring L1
concepts with no HTTP or auth concerns; callers are trusted by socket
permissions, not tokens. The control plane reconnects and re-subscribes after its
own restart, which is what makes control-plane restarts independent of agent
lifetimes.

L2 requests today: `agent.status`, `agent.capabilities`, `session.create`,
`session.list`, `session.get`, `session.prompt`, `session.abort`,
`session.messages`, `session.messagesPage`, `session.availableModels`,
`session.setModel`, `session.setThinking`, `session.stats`, `session.steer`,
`session.followUp`, `session.subscribe`, `session.unsubscribe`, and
`session.close`. The agent host streams `agent.state`, `session.state`, and
`session.event` events back over the same socket. No L1 or L2 request name is an
OMP frame name.

---

## 11. Authentication and security model

The threat model assumes the server is reachable from the public internet and
that attackers will probe it.

Principles: nothing that controls the server works without an authenticated,
revocable device credential (liveness is the only unauthenticated endpoint);
every credential is per-device and revocable, so losing a phone means revoking one
device; secrets are hashed on the server where possible and held in Android
Keystore on the client, and never appear in logs or URLs; the most dangerous
capabilities (shell, file writes, process control) are isolated behind scopes and,
where feasible, extra confirmation.

Transport security:

- HTTPS is the default. TLS is terminated by Caddy with a publicly trusted
  certificate, and the Node backend binds to loopback and never serves plaintext
  beyond `127.0.0.1`.
- The app accepts only publicly trusted certificates via the platform trust
  store. It does not accept arbitrary self-signed certificates and has no
  trust-any mode.
- HTTP is a supported but non-default mode (mode 1 above). It is disabled by
  default and requires explicit user selection and confirmation. The app shows a
  clear warning that credentials and all traffic are unencrypted and can be
  intercepted. The server refuses to bind a public interface over plaintext
  unless the operator explicitly enables it, and it logs a startup warning.
- The app never silently downgrades HTTPS to HTTP. If a secure connection fails,
  it reports the error and offers the mode picker rather than switching schemes.
- The selected mode is stored per server and can be changed later without
  re-pairing.

Pairing (Phase 1 minimal, Phase 3 full): the server generates a one-time pairing
code and a longer-lived bootstrap secret at install; the code is short-lived and
single-use. The app submits the code to `POST /v1/pair` with a device name and a
client-generated secret; the server returns a device token bound to a device
record. The token authenticates REST and WebSocket. Phase 3 adds expiring codes,
QR and deep-link delivery, device listing, revocation, rotation, and rate-limited
pairing attempts. When the selected mode is HTTP, the pairing code and device
token travel in clear; the app warns about this at pairing time and recommends
revoking the device afterward if the network was untrusted.

Authorization: scopes `read` (status, transcripts), `agent` (prompting, session
control), and `manage` (process control, config, pairing); host-level actions
require `manage`; every sensitive action is audit-logged with device id, action,
and result.

Hardening: rate limiting per device and per IP on auth and mutating endpoints;
input validation and size limits everywhere with no unbounded reads; L2 as a
`0600` local socket with no network surface; systemd hardening for both services
(dedicated unprivileged user, `NoNewPrivileges`, `ProtectSystem`, `PrivateTmp`,
restricted address families); secure installer practices (no piping a mutable
script to a shell without a pinned, checksummed source, least-privilege service
user, restrictive file modes on secrets).

---

## 12. Process lifecycle and ownership

This answers how the agent process is owned and how the system behaves across
crashes and restarts. The controlling requirement: the control plane must be
independently restartable without unnecessarily restarting `omp`.

### 12.1 Ownership

Each `omp --mode rpc` child is owned by the agent host, one child per active
session, in its own process group. The agent host does not own the control plane,
and the control plane does not own `omp`. This split exists because RPC is a
stdio protocol, so an `omp` process lives and dies with its parent: if the control
plane were the parent, every control-plane restart (deploy, config change, crash)
would kill the agent. Instead the agent host is a minimal, stable process that
rarely restarts, and the control plane reconnects to it over L2.

### 12.2 Control-plane restart or crash

The agent host and the `omp` children keep running. Devices see a WebSocket
disconnect; Caddy returns errors until the control plane is back. systemd
restarts the control plane, which reconnects to the L2 socket, re-subscribes, and
restores state from the agent host. In-flight agent turns are uninterrupted. The
control plane holds no authoritative agent state; the agent host does, backed by
durable `omp` session files.

### 12.3 Agent crash

The agent host observes the child exit (code or signal) and captures a stderr
tail. Restart policy: exponential backoff with jitter, a maximum restart rate,
and a circuit breaker; after repeated rapid failures the session is marked
`failed` and the agent host stops flapping, surfacing a clear error instead of
looping. Because `omp` session files persist on disk, a restart re-adopts the
session so history is preserved.

### 12.4 Agent-host crash or host reboot

If the agent host dies, its children's stdin closes, so `omp` exits cleanly
(exit 0). This is expected: the agent host is designed to be long-lived and
rarely restarts, while the control plane is the component that restarts often. To
avoid orphans, children are started in their own process group with a
parent-death signal, and a runtime state file records pid and process group; on
startup the agent host reconciles that file, terminating any unreusable leftover
(its pipes are gone) and re-adopting sessions from their durable files. On host
reboot, systemd starts the agent host, which starts no children until a session
is requested (lazy start) or re-adopts existing session files.

### 12.5 Duplicate instances

Single instance per service: the agent host takes an exclusive `flock` on a
runtime lock file; the control plane does the same on its own lock. A second
instance exits with a clear message rather than double-managing resources. Single
ownership per session: the agent host keeps a session registry and, where Oh My
Pi supports it, uses session ownership leases (RPC `get_session_lease`, or `omp
session lease`) to detect a session already owned elsewhere, preventing two
children from acting on the same session.

### 12.6 Recovery summary

| Event | Effect on `omp` | Effect on control plane |
| --- | --- | --- |
| Control-plane restart | none | restarts, reconnects L2, re-subscribes |
| Control-plane crash | none | systemd restarts it |
| Agent crash | that session restarts with backoff | unchanged, reports state |
| Agent host restart | children restart, sessions re-adopted | reconnect to new L2 socket |
| Host reboot | children gone, sessions re-adopted lazily | starts via systemd |

The system never restarts `omp` merely because the control plane restarted.

### 12.7 Agent confinement modes (ADR 0007)

Two modes decide how much of the host an `omp` child can reach, enforced at spawn
time in the agent host (the only component that spawns `omp`):

- `unrestricted` (default for a fresh install): `omp` runs with the same access
  as a normal `omp` install on the host. Full filesystem, full tool set, full
  network. This is the power-user mode and matches the current behavior.
- `restricted`: each `omp` child runs inside a bubblewrap (`bwrap`) sandbox bound
  to one workspace directory. The workspace is read-write, the runtime is
  read-only, and a private `/tmp` is provided, all under a dedicated unprivileged
  uid. Host home, other projects, and control-plane data are not visible.

The OS boundary is required because `omp`'s own `--cwd`, `--add-dir`, and tool
scoping are convenience, not a security boundary: a `bash` tool can reach outside
the cwd unless the process is confined. A dedicated unprivileged agent user plus
systemd hardening is the backstop.

Granularity: a server default with a per-project override. The server value lands
in Phase 4; the per-project override lands with the project registry (Phase 7).

Notes:

- The agent still needs outbound network access to reach model providers, so
  `restricted` confines the filesystem, not the network. Network confinement
  would require routing model calls through a local proxy and is future work.
- If `restricted` is selected but bubblewrap is unavailable, the agent host must
  refuse to start the child rather than run it unrestricted. No silent
  downgrade, matching the connection-mode rule.
- The mode is enforced only in the agent host. The control plane and the app
  carry and display the mode; they never implement confinement.
- `omp`'s own per-session knobs (`--cwd`, `--profile`, `--session-dir`,
  `--tools`, `--no-pty`, `--approval-mode`) layer on top of either mode.

---

## 13. VPS monitoring and process management

Monitoring (dependency-light, read from the OS): CPU from `/proc/stat` deltas;
RAM from `/proc/meminfo` plus swap; disk from `fs.statfs`; network from
`/proc/net/dev` counters with rate calculation; load average and uptime from
`os`; service health from control-plane self-report, agent-host state, and agent
process state.

Process management: the agent host supervises each `omp` child (spawn,
readiness, health, crash detection, backoff restart, clean shutdown; section 12).
Both Node services are managed by systemd (`Restart=on-failure` for the control
plane, a stricter always-restart policy for the agent host) with journald
logging; neither replaces systemd for its own lifecycle. Restarting `omp` is an
agent-host concern and never requires restarting the control plane, and a crashed
agent is reported without dropping device connections. Session state persists on
disk, so restarts do not lose history.

Why the agent host exists rather than a systemd unit per agent: RPC is a stdio
protocol, so the RPC peer must be a child of a long-lived parent. systemd follows
the control plane; the agent host follows the agent children. If a future HTTP RPC
transport lands upstream, the supervisor can optionally run agents as independent
units, but the current design does not depend on that.

---

## 14. Error handling and recovery

One error envelope for REST and WebSocket with stable codes and a `retryable`
hint; the app decides whether to retry, re-auth, or surface a message. Layered
timeouts: per HTTP request, per L2 call, per RPC command, per connection idle.
The control plane treats the agent host as an optional dependency: if L2 is down,
agent features report "agent unavailable" while auth, health, and monitoring keep
working, and the control plane reconnects and re-subscribes when L2 returns. The
WebSocket client reconnects with backoff and jitter, re-subscribes, and resumes
from the last sequence per topic; if resume fails it refetches state from REST.
The app distinguishes "agent down", "agent host down", and "control plane down",
because the fix differs. Malformed input is rejected without killing the process;
an unexpected internal error is caught at the edge, logged with a request id, and
returned as a generic error. Crashing `omp` never crashes the agent host;
crashing either Node service never crashes the other.

---

## 15. Future extensibility

Replacing the agent runtime changes only the agent host; L2 and L1 stay. Keep the
agent host's transport swappable so an upstream `--http` RPC transport can replace
stdio. OMP host-owned tools and approval prompts over RPC enable phone-side
approvals and custom tools in later phases without changing the app's core. The
app holds a list of servers from the start (one configured in Phase 1), so a
server switcher is additive. Sessions, subagents, goals, and compaction all
surface through the same event model, so richer agent UIs need no protocol
changes. For IP-only users, if the Let's Encrypt IP certificate path proves
awkward, add a guided flow that manages `default_sni` and the shortlived profile,
or a hosted relay. Direct HTTP (mode 1) remains the explicit, non-default option
for users who prefer it.

---

## 16. Decisions, risks, and open questions

### Decisions

- D1. Both services target Node.js 26 LTS, with Node.js 24 LTS as the fallback
  if a dependency or integration test does not support 26. Not pinned to Node 22.
  Bun is a documented alternative. Locked only after Phase 1 verifies the chosen
  major against the real dependencies and tests.
- D2. Oh My Pi integration is RPC over stdio via a supervised child process, not
  the in-process SDK. Drivers: the process isolation requirement, and alignment
  with OMP's own production integration.
- D3. We implement our own thin TypeScript RPC client instead of depending on
  the Bun-only `@oh-my-pi/pi-coding-agent` package.
- D4. Shared Zod protocol packages are the source of truth: L1 in
  `@omp-console/protocol`, L2 in `@omp-console/agent-protocol`.
- D5. A separate agent host owns `omp` children; the control plane owns the app
  API and holds no agent state. systemd owns both services.
- D6. No HTTP framework and no database in Phase 1. Add them only when a
  concrete requirement appears.
- D7. Approved. Process ownership is split (control plane vs agent host) so the
  control plane is independently restartable without restarting `omp` (section
  12). This lands in Phase 4 only. Every proposed ownership, recovery,
  session-adoption, orphan, and restart mechanism must be validated against
  actual OMP behavior in Phase 4, not assumed.
- D8. Caddy is the default TLS front, terminating publicly trusted certificates;
  the Node backend binds to loopback. No self-signed acceptance.
- D9. Four connection modes are supported (section 4.5): direct HTTP by IP
  (disabled by default, explicit opt-in, warning), HTTPS with a Let's Encrypt IP
  certificate, HTTPS with a domain certificate, and HTTPS over a private network.
  HTTPS is the default; HTTP is never automatic and never a silent downgrade; and
  the chosen mode is stored per server and can be changed later.

### Risks

- R1. Android emulator testing is not reliable here. The host has the Android
  SDK, Gradle, Java 21, and one AVD, but no `/dev/kvm` and no hardware
  virtualization flags, so any emulator runs in slow software mode. Plan: rely on
  backend and protocol tests, produce an installable APK, and report honestly if
  runtime Android testing cannot be done.
- R2. Caddy and the public certificate paths add deployment requirements the
  user must meet: a domain with DNS pointing at the server, or a public IP with
  port 80 reachable, plus ports 80 and 443 open. The installer must detect and
  explain these clearly.
- R3. `omp` provider login over RPC cannot complete interactive secret prompts,
  so first-time provider auth may need terminal access. Affects onboarding
  smoothness, not correctness.
- R4. Let's Encrypt IP certificates are short-lived (~6 days) and need reliable
  auto-renewal and a reachable port 80; `default_sni` is required for clients
  that reach a bare IP without SNI, and IPv6 needed a recent Caddy. Verify the
  installed Caddy version on the IP path.
- R5. Bundling the Android app and the shared protocol package in one workspace
  needs Metro configuration for monorepos. Known friction; set it up early.
- R6. The OMP RPC protocol is versioned and evolving (v1 and v2, with an
  unmerged HTTP proposal). Pin a tested `omp` version range, handle unknown frames
  gracefully, and negotiate capabilities rather than assuming.
- R7. Two services in Phase 4+ add operational surface (two units, an L2 socket,
  reconciliation). Justified by the restart-independence requirement, but the
  control plane must degrade cleanly when the agent host is absent.
- R8. Disk is limited in the build environment (~14 GB free). Android Gradle
  builds and SDK images are large; watch space.
- R9. In HTTP mode, credentials and traffic are unencrypted and can be
  intercepted. This is an accepted, explicit user choice, not a defect. Mitigate
  with the disabled-by-default posture, the confirmation and persistent warning,
  no silent downgrade, and a recommendation to revoke the device if the network
  was untrusted. Pairing over HTTP is the highest-risk case.

### Open questions

- Q1. Resolved. HTTP is a supported, non-default connection mode with explicit
  opt-in and warnings (D9, section 4.5).
- Q2. Resolved. The control plane and agent host split is approved and stays in
  Phase 4, with its mechanisms validated against actual OMP behavior (D7,
  section 12).
- Q3. Confirm Node 26 LTS with Node 24 LTS fallback (D1), pending the Phase 1
  dependency check.
- Q4. Decide the default onboarding target: domain first with the IP certificate
  path as an advanced option, or detect and pick automatically.
- Q5. Decide the `omp` version support policy and how to detect and warn on
  untested versions (R6).

### Reference facts

Oh My Pi:

- Package `@oh-my-pi/pi-coding-agent` (MIT), homepage `https://omp.sh`, repo
  `github.com/can1357/oh-my-pi`; binary `omp`. Installs via
  `curl -fsSL https://omp.sh/install | sh` (idempotent, checksummed prebuilt
  binary), Homebrew, `bun install -g`, or npm. `omp update --self`. Linux and
  macOS, `x86_64` and `arm64`; Alpine/musl needs `libstdc++` and `libgcc`.
- Output modes `text`, `json`, `rpc`, `rpc-ui`, `acp`. RPC is newline-delimited
  JSON (not JSON-RPC 2.0): stdout carries `ready`, responses, and events; stderr
  is diagnostics. Frames cap at 1 MiB; protocol v2 adds `rpc_chunk` reassembly up
  to 64 MiB. Responses correlate by `id`; events may interleave and arrive out of
  order; `prompt_result` reports a prompt's outcome and `session_settled` reports
  quiescence.
- Commands: `prompt`, `steer`, `follow_up`, `abort`, `new_session`,
  `open_session`, `switch_session`, `get_state`, `set_model`,
  `get_available_models`, `set_thinking_level`, `compact`, `bash`,
  `get_session_stats`, `get_messages`/`get_messages_page`, `export_html`,
  `get_session_lease`, `get_login_providers`, `login`.
- Events: `agent_start`/`agent_end`, `message_start`/`_update`/`_end`,
  `tool_execution_start`/`_update`/`_end`, `turn_start`/`turn_end`, compaction
  and retry lifecycle, `notice`, `queue_update`, `available_commands_update`.
- Reference clients exist in TypeScript, Python, Rust, and Go. Sessions persist
  as on-disk JSONL and expose ownership leases that the agent host uses to avoid
  duplicate owners.
- Prior art: `KenDJohnson/omp-remote` supervises `omp --mode rpc` behind an
  authenticated WebSocket; `robomp` runs one `omp --mode rpc` per work item.

Caddy and TLS:

- Caddy issues and renews publicly trusted certificates (Let's Encrypt/ZeroSSL)
  for public DNS names and needs ports 80 and 443 open, DNS A/AAAA pointing at the
  server, and a persistent data directory.
- Let's Encrypt IP certificates reached general availability on January 15, 2026:
  short-lived (~6 days), `shortlived` profile, HTTP-01 only (TLS-ALPN disabled),
  supported by Caddy since 2.10.1. Bare-IP clients may omit SNI, so set
  `default_sni`.
- Caddy can obtain trusted `*.ts.net` certificates from a local Tailscale
  instance, which makes a private-network deployment trusted.
