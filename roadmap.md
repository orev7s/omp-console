# OMP Console - Implementation Roadmap

This is the incremental plan. The complete product vision lives in `spec.md`.
The rules for how to work are in `AGENTS.md`.

Principle: one phase at a time, each phase independently testable and
verifiable. Do not start a phase until the previous phase's completion criteria
are met, unless a human explicitly authorizes parallel work.

Product frame: OMP Console is a coding environment, not a chat app or a
dashboard. Phases 5 to 9 all serve running and steering coding agents on real
projects.

## Current status

| Phase | Title | Status |
| --- | --- | --- |
| 1 | VPS to Android connectivity foundation | Done. Browser client served over HTTPS with a publicly trusted certificate and verified end to end (pairing, health and meta, WSS, echo, server events, reconnect after a control-plane restart). Node 26 confirmed, 26 backend tests pass. The Android APK is deferred until the web version is finished. |
| 2 | One-command installer and onboarding | Done (closed by decision, 2026-11-11). Installer, uninstaller, doctor, Caddy service, and mode handling built. Verified on this VPS (x86_64, glibc): full install, rerun, uninstall, fresh reinstall, domain mode with a public certificate, HTTP mode, and omp. Not verified: IP-only mode (port 80 is not reachable externally on this host), arm64, and musl. |
| 3 | Secure device enrollment and multi-device | Done (2026-11-11). Backend enrollment, scopes, revocation, rotation, and expiry are covered by the backend suite. The app Devices screen, re-pair flow, deep link plus optional QR, and mode switching are wired and typechecked. Not verified on a real Android device. IP-only mode is still blocked here. |
| 4 | Oh My Pi integration layer and agent host | Done (2026-11-11). Agent host service, L2 package and socket, real-omp RPC client, supervisor with backoff and circuit breaker, session manager, event mapper, capability probe, bubblewrap confinement modes, control-plane L2 client, systemd unit and installer wiring. 56 tests pass (36 backend, 20 agent host), including real omp, real socket, real bubblewrap, restart independence, and orphan cleanup. Not verified: a full systemd install on a fresh host. |
| 5 | Agent sessions and the live run view | In progress (2026-11-11). The full L1 session API (list, create, detail, prompt, abort, messages with cursor and limit, models, model, thinking, stats, steer, follow-up), the project registry (list, add, remove), the agent host session title, messages, paged messages, model, thinking, stats, steer, follow-up, and `queue.update`, and the session-first app shell (ADR 0008) with a density UI pass are built. The suites hold 70 backend tests, 20 agent host tests, and 71 app (Jest) tests. Not verified: a browser run of the shell, and a real device. Still open in the app UI: model and thinking selectors, stats, steer and follow-up controls, the queue display, and transcript load-more. See `docs/phase-reports/phase-5.md`. |
| 6 | Process supervision and VPS monitoring | Not started |
| 7 | Projects and file management | Not started |
| 8 | Terminal | Not started |
| 9 | Advanced capabilities | Not started |

Legend: `Not started` / `In progress` / `Blocked` / `Done`. Update this table
when a phase starts, finishes, or is blocked.

---

## Phase 1 - VPS to Android connectivity foundation

Objective: prove that the Android app can reliably and securely talk to a
control plane running on a real VPS over HTTPS and WebSocket. Nothing more.

This phase establishes the monorepo, the shared L1 protocol package, a minimal
but honest control plane, and a minimal app. It sets up the protocol and error
model properly even though the feature surface is small. It does not include the
agent host and does not spawn `omp`.

### Deliverables

Runtime precondition:

1. Install a supported Node.js LTS on the build and test host (Node 26, or Node
   24 fallback). The host currently has Node 22, which is not the target.
2. Verify that `ws`, `zod`, and the standard-library features we use run on the
   chosen major, and record the decision as an ADR (D1).

Control plane (the only backend process in this phase):

3. A minimal TypeScript service that runs persistently on a VPS.
4. `GET /v1/health` (unauthenticated liveness and minimal server info) and
   `GET /v1/meta` (authenticated server info and capabilities).
5. A WebSocket endpoint at `/v1/ws` over the same port, authenticated on the
   upgrade request.
6. A minimal pairing mechanism: a pairing code generated at setup is exchanged
   at `POST /v1/pair` for a per-device token. The token authenticates REST and
   the WebSocket. Tokens are stored hashed with a device record.
7. A WebSocket command that echoes a test message, plus a periodic server event,
   to prove duplex messaging.
8. Connection and agent state reported to the app. Agent state is reported as
   `unavailable` in this phase, because the agent host does not exist yet.
9. Proper error handling: one error envelope, stable codes, no stack traces to
   clients, request ids in logs, redacted secrets.
10. Network posture and connection modes: bind to loopback by default, with
    HTTPS via Caddy (domain certificate or Let's Encrypt IP certificate)
    demonstrated as the default. Also implement the direct HTTP mode, disabled
    by default and enabled only by explicit user selection and confirmation, with
    a clear warning and no silent downgrade. The service refuses a plaintext
    public bind unless explicitly enabled.
11. A systemd unit template and a way to run the service as a managed process.
12. Backend and protocol tests (see Testing).

Shared L1 protocol package:

13. `@omp-console/protocol` with Zod schemas and inferred types for health, meta,
    pairing, the WebSocket envelope, the echo command, and the periodic event,
    plus protocol version constants.

Android app:

The same UI also builds for the browser, and that build is the Phase 1
acceptance surface (ADR 0005). The Android APK is optional and is rebuilt after
the web version is finished.

14. A minimal React Native (Community CLI, TypeScript) app with a connection
    screen.
15. Fields for server address (host, port).
16. A pairing screen or field for the pairing code, calling `POST /v1/pair` and
    storing the device token in secure storage.
17. HTTP connectivity check against `/v1/health` and `/v1/meta`.
18. WebSocket connect, subscribe, send a test message, receive the echo and the
    periodic event.
19. Visible connection state: disconnected, connecting, connected, error, and
    which layer failed (HTTP vs WebSocket vs auth).
20. Basic failure handling and reconnect with backoff and jitter, and manual
    retry.
21. Connection mode selection: HTTPS by default, or direct HTTP behind an
    explicit confirmation and a persistent warning, stored per server and
    changeable later. No silent downgrade.
22. (Deferred.) An installable Android build. The browser build is the
    acceptance surface; the APK is rebuilt after the web version is finished.

### Technical tasks

- Set up the npm workspaces monorepo with `tsconfig.base.json`, strict mode, and
  ESM. Wire `packages/protocol` into both apps.
- Configure Metro for the app so it resolves the shared `@omp-console/protocol`
  package (watchFolders and resolver). Keep the Android app out of the npm
  workspaces to avoid React Native hoisting problems; it manages its own
  dependencies.
- Implement the thin HTTP router and the error envelope.
- Implement the WebSocket hub: upgrade handling, per-connection registry,
  subscribe/unsubscribe, heartbeat ping/pong, idle timeout, outbound queue
  limits.
- Implement auth: pairing code generation, `/v1/pair`, device records, token
  hashing, bearer verification for REST and for the WS upgrade.
- Implement request id propagation and structured, redacting logging.
- Implement graceful shutdown on `SIGTERM`.
- Implement config loading (defaults, file, environment), with loopback bind as
  the default.
- Implement the JSON store with atomic writes for devices and settings.
- Implement the loopback-only plaintext development mode and the loopback-bind
  safety rule.
- Write the systemd unit template for the control plane.
- Document the Caddy front (a minimal Caddyfile and the domain or IP certificate
  setup) needed to demonstrate the remote path. Full installer automation is
  Phase 2.
- Build the app: navigation, connection screen, api client, realtime client
  state machine, secure storage, design tokens.
- Build the APK.

### Dependencies

- A supported Node.js LTS on the host (26 preferred, 24 fallback).
- For end-to-end remote testing: either a domain pointing at the VPS with ports
  80 and 443 open (Caddy issues a trusted certificate), or a public IP with port
  80 reachable (Let's Encrypt IP certificate), or a private network such as
  Tailscale or WireGuard. No dependency on `omp`.

### Testing requirements

Control plane and protocol:

- HTTP: `/v1/health` returns the expected shape; `/v1/meta` requires auth and
  rejects missing or bad tokens.
- Pairing: valid code issues a token; invalid or expired or reused code is
  rejected; pairing attempts are rate limited.
- WebSocket: connects with a valid token, rejects upgrade with no or bad token,
  receives echo of a sent message, receives the periodic event, and is closed on
  idle timeout.
- Reconnect: a simulated client drops and reconnects, re-subscribes, and gets
  events again. The server cleans up the dead connection.
- Backpressure: a deliberately slow consumer is disconnected, not allowed to
  grow server memory.
- Error envelope: unknown route, invalid JSON, oversized payload, and internal
  error each return the correct code and never a stack trace.
- Protocol: a simulated client exercises the wire contract with no Android
  involvement.
- Connection modes: HTTP is off by default and requires an explicit enable;
  HTTPS via Caddy is the default path; the service refuses a plaintext public
  bind unless enabled; nothing downgrades HTTPS to HTTP automatically.

Android:

- Attempt an emulator run if feasible. This host has the Android SDK, Gradle,
  Java 21, and one AVD, but no `/dev/kvm`, so the emulator runs in slow software
  mode and may be unusable. If the emulator cannot be used reliably, say so.
- Produce an installable APK for manual device testing against a real VPS.
- Do not claim Android runtime testing happened unless it did.

Report at the end of the phase: tests passed, tests not possible, emulator
availability, APK produced or not, and anything that needs manual verification.

### Completion criteria

The acceptance surface is the browser build of the same mobile-first UI (ADR
0005). The Android APK is optional and deferred until the web version is
finished, so it is not a completion requirement here.

1. The browser build is served over HTTPS with a publicly trusted certificate
   and completes onboarding.
2. With the control plane running on a VPS, the browser connects over HTTPS and
   WSS (through Caddy with a trusted certificate) or over the explicit HTTP mode
   if the user selects it, authenticates, passes the HTTP health and meta
   checks, opens the WebSocket, sends a test message, receives the echo, and
   receives at least one server event.
3. The client displays accurate connection state and correctly reports auth
   failures and network failures separately.
4. The client reconnects automatically after a network drop or a control-plane
   restart and returns to a connected, subscribed state.
5. All backend and protocol tests pass, and the honest test report is produced.
6. The control plane binds loopback by default; HTTP is available only as an
   explicit opt-in and is never the default or a silent downgrade.
7. The runtime decision (Node 26 or 24) is verified against the real
   dependencies and recorded as an ADR.
8. `spec.md` is accurate for what was built, and any decisions taken are in
   `docs/decisions/`.

### Explicitly deferred (do not build in Phase 1)

- The agent host and any Oh My Pi integration, spawning `omp`, or RPC.
- Agent chat, sessions, streaming, transcripts.
- VPS monitoring of CPU, RAM, disk, or network.
- Process control: start, stop, restart of anything.
- File explorer, projects, terminal.
- Multiple servers or a server switcher UI (the data model leaves room).
- Full enrollment automation, QR pairing, device management UI, revocation UI
  (Phase 3).
- Automated Caddy installation and configuration (Phase 2). Phase 1 documents
  and demonstrates the Caddy front, but the automation is Phase 2.
- Database, audit log storage, metric history.
- A separate web dashboard. A browser build of the same mobile-first UI is
  allowed and is used for no-install access and the end-to-end test (ADR 0005);
  it is not a dashboard and does not add a second UI or feature set.

---

## Phase 2 - One-command installer and onboarding

Objective: make install a single, safe, idempotent command that leaves a running
service behind a trusted TLS front with clear pairing instructions.

Deliverables:

- `installer/install.sh` that detects OS and architecture (including glibc vs
  musl), verifies or installs Node.js LTS, installs or verifies `omp`, installs
  the control plane, installs and configures Caddy, writes config, installs the
  systemd unit, starts the service, runs health checks, and prints the server
  address and pairing material.
- Connection modes: detect and configure any of the four modes. Domain (normal
  certificate), IP-only (Let's Encrypt IP certificate with the shortlived profile
  and `default_sni`), private network (Tailscale/WireGuard), or direct HTTP
  (explicit opt-in with a warning). Explain what each requires: a DNS record,
  open ports 80 and 443, a private network, or an explicit insecure choice.
- Idempotent reruns that detect and update existing installs.
- `uninstall.sh` and a diagnostics command (for example `doctor`) that checks
  DNS, ports, certificate status, and service health.
- systemd unit with restart-on-failure and hardening, plus the Caddy service.

Dependencies: Phase 1 control plane, API, auth, and systemd unit template.

Testing: installer runs in a clean container or VM for x86_64 and arm64; rerun
is safe; missing prerequisites produce clear errors; the domain, IP certificate,
and direct HTTP paths are exercised; service starts and passes health; uninstall
removes cleanly.

Completion: a fresh VPS reaches a healthy running service and a successful phone
pairing with the single documented command, in the domain case, the IP-only
case, and the explicit HTTP case.

Deferred: unattended automatic enrollment (Phase 3), upgrade channels, the
private-network onboarding flow if not complete.

Closure note (2026-11-11): closed by decision to unblock Phase 3. Verified on
this VPS (x86_64, glibc): install, rerun, uninstall, fresh reinstall, domain mode
with a public certificate, HTTP mode, and `omp`. Not verified and carried as
known gaps: IP-only mode (port 80 is not reachable externally here), arm64, and
musl.

---

## Phase 3 - Secure device enrollment and multi-device

Objective: make pairing and credential lifecycle production-grade.

Deliverables:

- Short-lived, single-use pairing codes with QR and deep-link delivery.
- Device registry: list, name, last-seen, and revoke.
- Token rotation and expiry, and a re-pair flow.
- Scope model (`read`, `agent`, `manage`) enforced across REST and WebSocket.
- Finalized network onboarding for all four modes: domain, IP certificate,
  private network (Tailscale/WireGuard), and direct HTTP. Document the DNS and
  port requirements, provide a guided flow for the IP-only case, and implement
  the HTTP confirmation and warning UX with an easy way to switch modes later.
- Rate limiting hardened; pairing brute force made impractical.

Dependencies: Phase 2 installer, Phase 1 auth and WS.

Testing: enrollment end to end for each network path; revocation takes effect
for REST and an open WebSocket; expired codes rejected; scope violations
rejected; certificate trust verified on a real device.

Completion: multiple devices pair over a trusted connection, are individually
revocable, and revocation is enforced immediately on live connections.

Deferred: hosted broker auto-enrollment.

Progress (2026-11-11): backend enrollment core landed. Store schema v2 with
in-place migration; short-lived single-use pairing codes; device registry with
list, rename, revoke, and rotate; soft-delete revocation that also drops live
WebSockets; enforced `read`/`agent`/`manage` scopes on REST and WebSocket
subscriptions; tighter pairing rate limit. See
`docs/decisions/0006-enrollment-and-scopes.md`. Still open: app Devices UI,
QR/deep-link pairing delivery, the guided IP-only onboarding flow, and the
HTTP-mode warning review.

Completion note (2026-11-11): the app half landed. The Devices screen lists,
renames, revokes, and rotates the current device's token; the Home screen links
to Devices and to Connection so the mode can be changed without re-pairing; a
revoked or expired token now offers a Pair again path; the installer prints an
`ompconsole://pair` deep link and, when `qrencode` is installed, a QR of the same
link. Verification: backend typecheck and 36/36 backend tests pass, the app
typechecks, the web production build succeeds, and the installer scripts pass
`bash -n`. The browser build was also walked at a 390x844 phone viewport against
a real backend: pair over plain HTTP, reach Home, open Devices, see both a
second device and "This device", open the revoke confirmation, and revoke it
immediately. Not verified: a real Android device (deep link, QR scan, Keystore,
native WebSocket), the IP-only certificate path, and arm64 or musl.

---

## Phase 4 - Oh My Pi integration layer and agent host

Objective: control `omp` from the VPS safely and observably, with a real process
boundary and independent restartability, and no UI polish yet.

Scope change accepted (2026-11-11). Phase 4 now includes two agent confinement
modes, enforced in the agent host at spawn time. `unrestricted` (default) runs
`omp` with full host access, like a normal `omp` install. `restricted` runs each
`omp` child in a bubblewrap sandbox bound to one workspace folder, with a
dedicated unprivileged user as backstop. The mode is a server default with a
per-project override (the override lands with the project registry, Phase 7).
See ADR 0007 and `spec.md` section 12.7. Fold these into the deliverables and
completion criteria when Phase 4 work starts.

Completed (2026-11-11): the agent host is a separate service. It owns one `omp`
child per session with lazy start, a single-instance lock, process groups,
runtime-state reconciliation for orphans, exponential backoff with a circuit
breaker, protocol v2 negotiation, strict `rpc_chunk` reassembly, per-command
timeouts and cancellation, and stdout drain on shutdown. The event mapper
translates OMP frames into the L2 model, and the capability probe reports the
omp version, protocol versions, commands, and login providers. Confinement modes
land per ADR 0007, with `restricted` running a full real session inside
bubblewrap. The control plane has an L2 client that reconnects and reports agent
state, wired into `/v1/meta` and `server.status`. The installer builds and
installs both services and adds the agent host systemd unit.

Tests: 56 pass (36 backend, 20 agent host) on Node 26.13.1, including one real
`omp` v18.18.9 prompt over the keyless Kilo AI Gateway model, a real L2 socket
session, a full restricted session inside bubblewrap, a crash-restart, a
control-plane reconnect that leaves the child pid unchanged, and orphan
reconciliation. Not verified: a full installer run on a fresh host (the live
deployment was not disturbed). The per-project confinement override is Phase 7.

Deliverables:

- `apps/agent-host/`: a separate Node.js service that owns all `omp` children.
  Modules: supervisor, RPC client, session manager, event mapper, L2 server,
  capability probe, sandbox.
- `packages/agent-protocol/`: the L2 protocol between the control plane and the
  agent host.
- Agent confinement modes (ADR 0007): `unrestricted` (default) and `restricted`
  (a bubblewrap sandbox per child, bound to one workspace folder, with a
  dedicated unprivileged user as backstop). Server default with a per-project
  override. Refuse to start a restricted child when the sandbox is unavailable.
- Validate, against actual OMP behavior, that each proposed mechanism works
  before relying on it: process ownership, control-plane restart without agent
  restart, session adoption from disk, orphan handling, and restart backoff. Do
  not assume a recovery mechanism works without testing it.
- Process model exactly as designed in `spec.md` section 12: ownership,
  single-instance locks, single ownership per session via session leases,
  process groups and parent-death signals, runtime state file with startup
  reconciliation, restart backoff with a circuit breaker.
- RPC client: spawn `omp --mode rpc`, parse `ready`, negotiate v2 when
  advertised, implement `rpc_chunk` reassembly, correlate by `id`, timeouts,
  cancellation, stdout drain after stdin close.
- Event mapping from OMP events into the L2 event model, streamed through the
  control plane over the existing L1 WebSocket.
- Capability detection: `omp` version, protocol versions, available commands,
  login providers.
- Control-plane changes: an L2 client that reconnects and re-subscribes after a
  restart, and reports agent state (`unavailable`, `stopped`, `starting`,
  `ready`, `busy`, `crashed`) without ever spawning `omp` itself.

Dependencies: Phase 1 protocol and WS, Phase 2 installer (installs `omp`),
Phase 3 scopes.

Testing: against a real `omp` binary in a controlled environment and against a
scripted fake `omp` that emits known frames (deterministic tests for framing,
correlation, chunk reassembly, crash and restart). Plus the lifecycle tests that
matter here:

- A control-plane restart does not restart `omp`; the control plane reconnects
  and re-subscribes.
- An agent crash restarts only that session, with backoff, and never the control
  plane.
- Orphan reconciliation on agent-host startup terminates unreusable leftovers
  and re-adopts sessions from disk.
- A second agent-host or control-plane instance is refused.
- Two children cannot own the same session.

Completion: the backend can start `omp`, send a prompt, stream events, abort,
and recover from an `omp` crash, all verified by tests, with the agent process
isolated from the control plane and the control plane restartable without
restarting the agent.

Deferred: rich chat UI (Phase 5), monitoring UI (Phase 6).

---

## Phase 5 - Agent sessions and the live run view

Objective: the core product surface. Create, open, switch, and resume sessions,
watch a real agent run live (assistant text, thinking, and every tool call as it
happens), then steer it.

Scope change accepted (2026-11-11). Phase 5 now includes the app shell. Today the
shell is connection-centric: `Home` confirms the connection and links out to
Devices, Connection, and Activity. That made sense while reaching the server was
the whole product. Now that sessions are the product, the shell becomes
session-first, following the OpenCode interface: a session list grouped by
recency with the project folder under each title, open sessions kept in an in-app
tab strip, and the connection and device controls moved into a settings sheet.
The connection status shrinks to a compact live element in the shell chrome. See
ADR 0008. Icons are limited to the brand mark and the abstract status glyphs; no
per-session or navigation iconography.

Progress (2026-11-11): the backend and agent host halves are built, and the app
shell plus a density UI pass have landed. The L1 session API covers list, create,
detail, prompt, abort, messages (cursor and limit), models, model, thinking,
stats, steer, and follow-up; projects are list, add, and remove; agent-dependent
routes return a retryable 503 `agent_unavailable`; scopes are `read`, `agent`, and
`manage`. The session registry builds transcripts from L2 events and session
streams broadcast on `session:<id>.events`. The agent host adds a session title,
`session.messages`, paged messages, model and thinking changes, stats, steer,
follow-up, and `queue.update`. The app is session-first per ADR 0008: the Sessions
landing, the session tab strip, the live run view, and the settings sheet, with a
UI pass that matches OpenCode density (compact rows and type, Markdown in
messages, collapsible Thinking and tool blocks labeled in words, no icons).
Verification: the backend suite holds 70 tests (up from 55), the agent host 20,
and the app 71 Jest tests; the app typechecks and the web build succeeds. Not
verified: a browser run of the shell and a real device. Still open in the app UI:
model and thinking selectors, session stats, steer and follow-up controls, the
queue display, and transcript load-more (the API and store methods exist, but no
control calls them), and the landing list does not yet refresh live from
`agent.status`. See `docs/phase-reports/phase-5.md`.

Deliverables:

Backend (the L1 session API, none of which exists yet):

- `GET /v1/sessions` (list, cursor paginated), `POST /v1/sessions` (create), and
  `GET /v1/sessions/:id` (detail and current state).
- `POST /v1/sessions/:id/prompt`, `POST /v1/sessions/:id/abort`, and the steer
  and follow-up equivalents the runtime supports.
- `GET /v1/sessions/:id/messages` (paged transcript backfill).
- Model and thinking-level support: list available models, set the model and the
  thinking level for a session, and report session stats and context usage.
- WebSocket topics for a session: the event stream (assistant text, thinking,
  tool execution, turn and retry lifecycle) with per-topic sequence numbers and a
  bounded replay buffer for resume, plus agent status. Routed to the agent host
  over L2.

App shell (ADR 0008):

- A session-first landing screen: recent sessions grouped by Today, Yesterday,
  Earlier, each row showing the session title and the project folder; a New
  session primary action.
- An in-app tab strip for open sessions, with the active tab and a horizontal
  scroll when it overflows. Tabs are a session switcher, not routes.
- Connection status as a compact live element in the shell chrome; the full
  server details, Devices, Connection, and Activity moved into a settings sheet.
- Onboarding (Welcome, Connect, Pair) stays as it is.

Live run view:

- Streaming render of assistant text, thinking, and tool execution events, with a
  clear working and thinking state.
- Send prompt, steer, follow up, and abort.
- Queue display and management where supported.
- Model and thinking-level selection; session stats and context usage.
- Transcript backfill from REST with pagination, and replay-based resume over
  WebSocket on reconnect.
- Clear surfacing of provider errors, usage limits, and cost caps.

Dependencies: Phase 3 auth and scopes, Phase 4 agent host.

Testing: scripted agent events drive the run view deterministically; transcript
pagination and reconnect resume tested; abort and steer tested; errors mapped to
clear UI states; the browser end-to-end harness covers the landing, opening a
session, and a streamed run.

Completion: from the browser build, a user can create a session, watch a real
agent run with live tool calls, steer and abort it, change the model, and
reconnect without losing transcript continuity.

Deferred: subagents, goals, and multi-project navigation. The landing groups by
time and shows the folder; the project registry itself is Phase 7.

---

## Phase 6 - Process supervision and VPS monitoring

Objective: manage and observe the server from the phone.

Deliverables:

- Start, stop, and restart `omp` from the app, with scope checks, routed to the
  agent host over L2.
- Supervisor view: state, uptime, restart count, circuit-breaker state, last
  error.
- Metrics: CPU, RAM, disk, network, load, uptime, with history.
- Health aggregation and simple alerts (thresholds, agent down, agent host
  down).
- Log viewer with useful filtering and clear errors.
- Persistence upgrade to a database for sessions metadata, audit log, and metric
  history (SQLite; see spec 7.1).

Dependencies: Phase 4 agent host and lifecycle, Phase 5 for the shell to host it.

Testing: supervisor transitions under crash, hang, and kill; restart backoff and
circuit breaker; orphan reconciliation after a forced agent-host kill; metric
collection correctness against known load; threshold alerts; log retrieval and
redaction.

Completion: the app shows accurate live health and can control the agent process
without ever needing to restart the control plane, and a control-plane restart
never disturbs a running agent.

Deferred: complex alerting, external notifications.

---

## Phase 7 - Projects and file management

Objective: work with the code the agents act on.

Deliverables:

- Project registry: add, list, and select project roots and cwd per session.
- File browser: list, read, and search within a project.
- File edit with review before write (scoped and audited).
- Git status and diff view.

Dependencies: Phase 5 sessions, Phase 6 scopes and audit.

Testing: path traversal and symlink escape rejected; large files bounded; edit
conflict detection; diff rendering from real repositories.

Completion: a user can browse and edit project files from the phone safely, with
path sandboxing verified.

Deferred: rich code editing, merge tooling.

---

## Phase 8 - Terminal

Objective: a real terminal from the phone.

Deliverables:

- Interactive shell over WebSocket (PTY), with resize and flow control.
- Safe handling of long output and disconnects.
- Optional command policy or confirmation for destructive commands.
- Integration with the `bash` RPC capability where appropriate.

Dependencies: Phase 5, Phase 6 scopes.

Testing: PTY session lifecycle; resize; reconnect; output backpressure; policy
enforcement.

Completion: a functional terminal that survives reconnects and never exposes
unauthenticated execution.

Deferred: multi-terminal tabs, session sharing.

---

## Phase 9 - Advanced capabilities

Objective: capabilities that build on a stable core.

Candidate items (reorganized as dependencies become clear):

- Host tools and phone-side approvals using OMP's host tool interface.
- Notifications for long-running tasks and completed runs.
- Multiple servers with a switcher and per-server state.
- Subagents, goals, plan mode, and compaction surfaced in the UI.
- Session export and share.
- Extensions and skills management.
- Hosted broker for zero-code enrollment.
- Guided IP-only onboarding improvements and the `default_sni` and shortlived
  certificate flow if it proves awkward.
- Optional adoption of an upstream HTTP RPC transport if it lands.

Dependencies: the specific capability's prerequisites, defined when the phase is
scoped.

Testing: defined per capability when scoped.

Completion: defined per capability when scoped.

---

## Sequencing rationale

- Connectivity first (Phase 1) because everything depends on a trustworthy
  transport and auth foundation.
- Installer next (Phase 2) so later phases run against a real, reproducible
  deployment with a trusted TLS front instead of hand setup.
- Enrollment and scopes (Phase 3) before any capability that must be authorized,
  so security is not retrofitted, and so all four connection modes are settled
  before remote control ships.
- Agent integration (Phase 4) before any agent UI (Phase 5), so the UI is built
  on a tested, isolated integration rather than on assumptions. Phase 4 also
  establishes the process-ownership model, because the restart-independence
  guarantee is an architectural property that must be designed in, not added
  later.
- Monitoring and supervision (Phase 6) after chat, because chat already
  exercises the agent process and reveals the supervision needs.
- Projects and terminal (Phases 7 and 8) are powerful but higher risk, so they
  come after the core is stable and scoped.
- Advanced items (Phase 9) are intentionally unscheduled until the core ships.
