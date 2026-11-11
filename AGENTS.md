# AGENTS.md - rules for AI coding agents in this repository

This repository builds OMP Console: an Android app (React Native, TypeScript)
and a VPS backend (Node.js, TypeScript) that let a user run and control Oh My Pi
(`omp`) coding agents on their own server.

Read `spec.md` for the architecture and `roadmap.md` for the plan. When this file
and any other document disagree, `spec.md` wins for architecture and this file
wins for process.

---

## 1. The one rule that matters most

Work only on the phase that is currently authorized. Do not start, scaffold, or
"prepare for" a later phase unless a human explicitly authorizes it.

- The current authorized phase and its status live in the "Current status"
  table in `roadmap.md`. If that table says a phase is not started, do not
  build it.
- If a task needs something from a later phase, stop and ask. Do not pull it
  forward.
- Do not silently expand scope. If you think a milestone needs more work than
  listed, propose the change in the roadmap first.
- When in doubt about whether something is in scope, it is out of scope.

Before starting work, state which phase you are implementing and list the
deliverable. When done, report against that phase's completion criteria.

## 2. Never break these boundaries

- The Android app talks only to our public API (L1). It must never know about
  `omp`, its RPC frames, the agent host, the L2 protocol, or any process concept.
  No `omp` strings or OMP frame shapes in app code.
- Three independent protocol layers: L1 is the app-facing API, L2 is the
  internal control-plane to agent-host protocol, L3 is Oh My Pi's RPC. They are
  versioned separately. Translating between them happens in exactly one place
  per hop and never leaks upward.
- The control plane has no agent knowledge. It never spawns `omp`, never reads
  OMP frames, and never imports OMP types. It speaks L2 to the agent host.
- The agent host is the only component that knows `omp`. Everything OMP lives
  there.
- The control plane must survive the agent host (and `omp`) being absent. Code
  that assumes the agent host is running is a bug. Auth, health, and monitoring
  must work with no agent present.
- The control plane must be independently restartable without restarting `omp`.
  Do not create a design where a control-plane restart kills the agents. See
  `spec.md` section 12.
- App and backend are independently deployable. No shared runtime state, no
  assumptions that they version together, only the shared protocol packages.

## 3. Repository layout

```
omp-console/
  spec.md  AGENTS.md  roadmap.md
  package.json                 npm workspaces root
  tsconfig.base.json
  packages/protocol/           @omp-console/protocol: L1 zod schemas + types
  packages/agent-protocol/     @omp-console/agent-protocol: L2 schemas (Phase 4+)
  apps/backend/                @omp-console/backend: control plane (Node.js)
    src/{http,ws,auth,agenthost,monitor,store,config,log,util}/
    test/
  apps/agent-host/             @omp-console/agent-host: OMP owner (Phase 4+)
    src/{supervisor,rpc,sessions,events,server,config,log,util}/
    test/
  apps/android/                React Native app (Community CLI, no Expo)
    android/                   native Android project (Gradle)
    App.tsx                    root component
    src/                       screens, navigation, api, realtime, state, ui
  installer/                   install.sh, uninstall.sh, doctor.sh, lib/,
                               caddy/, systemd units
  docs/decisions/              architecture decision records
```

Phase 1 builds only `packages/protocol`, `apps/backend`, and `apps/android`.
`apps/agent-host` and `packages/agent-protocol` are Phase 4 and must not be
created early. Put code where it belongs. Do not create new top-level folders
without updating this section and `spec.md`.

## 4. Language, style, and conventions

- TypeScript everywhere, strict mode, ESM. No `any` at a network, process, or
  storage boundary. Validate with Zod and use the inferred type.
- One responsibility per file. Keep every source file under 800 lines. If a file
  is getting close, split it.
- Names describe intent. No `utils2`, `helpers`, `misc`, or dumping grounds. A
  `util/` file must have a specific, nameable purpose.
- Prefer many small files with clear seams over a few large ones.
- No em dashes or en dashes in code comments, docs, commit messages, or PR
  text. Use a comma, a period, or parentheses.
- No filler language and no marketing tone. Write like an engineer to a
  teammate.
- Comments explain why, not what. Do not narrate obvious code.
- Error messages are actionable and name the fix. No bare "invalid input".

## 5. Dependency policy

- Do not add a dependency without justification. State what it does, why
  standard library or existing code cannot, and what it costs.
- Prefer the platform: `node:http`, `node:test`, `fetch`, `AbortController`,
  `/proc`, `fs.statfs`.
- The approved runtime dependencies are `ws` and `zod`. Adding another runtime
  dependency needs a human decision recorded in `docs/decisions/`.
- No web framework, ORM, or database in Phase 1. Add them only when a concrete
  requirement appears and the roadmap is updated.
- No Rust, Go, or other languages. If you believe one is required, stop and
  present a measurable justification. Do not add it.
- Pin versions. Do not use floating ranges for runtime dependencies.

## 6. Backend rules

Two Node.js services, one runtime choice:

- Target Node.js 26 LTS. Node.js 24 LTS is the fallback if a dependency or
  integration test does not support 26. Do not pin to Node 22 without a specific
  documented compatibility reason. Do not use Bun-only APIs; code must run on
  Node.
- The control plane (`apps/backend`) and the agent host (`apps/agent-host`,
  Phase 4+) are separate processes with separate systemd units.

Control plane:

- Entry point wires modules together. Business logic lives in modules, not in
  the entry file.
- HTTP: `node:http` with a thin internal router. WebSocket: `ws` in no-server
  mode, handling the `upgrade` event. Same port for both.
- Bind to loopback by default. TLS is Caddy's job; do not terminate TLS in the
  Node process.
- Direct HTTP is a supported, non-default connection mode (D9). The server binds
  a public interface over plaintext only when the operator explicitly enables it,
  and logs a loud startup warning. Never make HTTP the default and never fall
  back to it automatically.
- Every handler validates input, enforces auth and rate limits, and returns the
  standard envelope. No handler trusts the client.
- Every response carries a request id and server time. Log request id, route,
  status, duration.
- Never log secrets, tokens, pairing codes, or raw request bodies that may
  contain them. Logs go through the redacting logger.
- Map all thrown errors to the error envelope at the edge. Never return stack
  traces, file paths, or internal messages to a client.
- Long-lived or streaming work goes over WebSocket, not polling.
- Graceful shutdown: stop accepting, close connections with a reason, flush the
  store, then exit. Handle `SIGTERM`.

Persistence:

- Phase 1: JSON file with atomic replace (temp file, fsync, rename). Never
  mutate the live file in place.
- Record schema is versioned. Migrations are explicit and tested.
- Store secrets hashed where possible. File modes restrictive.

## 7. Oh My Pi integration and process lifecycle rules

All OMP knowledge lives in `apps/agent-host/`.

- Integrate over RPC by spawning the `omp` binary with `--mode rpc`. Do not use
  the in-process SDK. Do not add `@oh-my-pi/pi-coding-agent` as a dependency.
- The control plane must never spawn `omp`. Only the agent host does.
- Wait for the `ready` frame before sending commands. Read the advertised
  protocol version and limits from it. Negotiate v2 only if the ready frame
  advertises it, and only if you implement `rpc_chunk` reassembly correctly.
- Correlate responses by `id`. Never assume responses arrive before events or in
  order. Unknown frame types are ignored and logged at debug level, never fatal.
- stdout is the protocol channel. stderr is diagnostics only. Never feed stderr
  into the JSON parser.
- Apply a per-command timeout and support cancellation. Do not let a stuck
  command hang a device request.
- The child's stdout must keep being read even after stdin closes, or shutdown
  can hang. Implement backpressure; do not buffer without limit.
- Translate OMP events into our L2 model here. Nothing above L3 sees OMP names.
  If OMP has no equivalent for something we want, do not invent it.
- Do not assume capabilities. Probe them. Notably: the RPC `login` command
  cannot complete interactive secret prompts, there is no general remote HTTP
  API today, and `--mode rpc --http` is an unmerged proposal. Do not build on
  unmerged features.

Process ownership and recovery (see `spec.md` section 12):

- One `omp` child per active session, owned by the agent host, each in its own
  process group.
- Never let a control-plane restart restart `omp`. If a change would make that
  happen, stop and raise it.
- Single instance per service: take an exclusive lock file. A second instance
  exits with a clear message.
- Single ownership per session: use the session registry and Oh My Pi's session
  leases to prevent two children acting on the same session.
- Prevent orphans: use process groups and a parent-death signal, record child
  pid and process group in a runtime state file, and reconcile that file on
  startup (terminate unreusable leftovers, re-adopt sessions from disk).
- Restart policy: exponential backoff with jitter, a maximum restart rate, and a
  circuit breaker that stops flapping and surfaces a clear `failed` state.
- The agent host must not assume a specific agent survives a restart. Sessions
  are re-adopted from durable session files.

## 8. Android application rules

- React Native Community CLI with TypeScript. No Expo. React Navigation for
  navigation. Build with Gradle (`assembleDebug` / `assembleRelease`); the app
  must build locally on a host with the Android SDK.
- Layers: `app/` routes are thin; `features/` own screens and hooks; `api/`
  and `realtime/` own all network access; `state/` owns stores; `storage/` owns
  persistence; `ui/` owns tokens and primitives.
- No networking in components. Screens read state and dispatch intents.
- Validate every network payload with `@omp-console/protocol` schemas. No
  unvalidated JSON into state.
- One WebSocket client for the whole app. Reconnect, backoff, heartbeat, and
  re-subscription live in `realtime/`, not in screens.
- Device token and any secret go in `react-native-keychain` (Android Keystore).
  Preferences go in `@react-native-async-storage/async-storage`. Never log
  secrets.
- TLS is ordinary platform validation of publicly trusted certificates. Do not
  add a "trust any certificate" mode and do not accept arbitrary self-signed
  certificates.
- Connection mode is a user choice per server: HTTPS by default, or direct HTTP
  behind an explicit confirmation and a persistent warning. Store the mode, never
  downgrade the scheme automatically, and keep it changeable later.
- Build UI from design tokens (color, spacing, typography, radius). No hardcoded
  hex colors, magic spacing, or one-off font sizes in screens.
- Support light and dark themes from the start.
- Nothing Android-specific in shared code. Keep platform code behind small
  modules.

## 9. API, WebSocket, and L2 conventions

L1 (app-facing):

- Version in the path: `/v1/...`. WebSocket at `/v1/ws`.
- Auth: `Authorization: Bearer <device-token>` on REST and on the WebSocket
  upgrade request. Never put tokens in query strings. Browser clients that
  cannot set upgrade headers may use a `bearer.<token>` WebSocket subprotocol
  instead; keep header auth as the primary path.
- Success bodies are the resource or a typed result. Errors are always
  `{ error: { code, message, details?, retryable? } }` with a stable `code`.
- WebSocket frames: `{ v, type, id?, ts, ...payload }`. Commands carry `id` and
  get a response echoing `id`. Events are typed and versioned by `v`. Unknown
  `type` values are ignored, not fatal.
- Outbound is subscription-scoped. A client receives only topics it subscribed
  to. Per-topic sequence numbers allow resume after reconnect.
- Heartbeat with idle timeout. Enforce outbound queue limits and disconnect slow
  consumers rather than growing memory.
- Adding a field is backward compatible. Removing or renaming needs a version
  bump and a migration note in `spec.md`.

L2 (control plane to agent host):

- Transport is a local Unix domain socket, mode `0600`, owned by the service
  user. Never bind it to a network interface.
- Local, versioned request/response plus a server-initiated event stream,
  mirroring L1 concepts with no HTTP or auth concerns.
- Callers are trusted by socket permissions, not tokens.
- The control plane must reconnect and re-subscribe after its own restart
  without disturbing `omp`.

## 10. Security requirements

Non-negotiable, from the first commit:

- Nothing that controls the server works unauthenticated. Only liveness is
  public.
- Every credential is per-device and revocable. No shared long-lived master
  secret used as an API token.
- TLS is terminated by Caddy with a publicly trusted certificate. The Node
  backend binds to loopback and serves plaintext only on `127.0.0.1`.
- HTTPS is the default. HTTP is a supported, non-default mode: disabled by
  default, explicit opt-in with confirmation, a clear warning that credentials
  and traffic are unencrypted, never used as a silent fallback, and changeable
  later. Never downgrade HTTPS to HTTP automatically.
- Do not accept arbitrary self-signed certificates and do not add a trust-any
  mode.
- Validate and bound all input. Enforce size limits. Reject unknown fields.
- Rate limit auth and mutating endpoints per device and per IP.
- Scope checks on every sensitive action. Host-level actions require `manage`.
- Redact secrets everywhere: logs, errors, telemetry, crash output.
- The installer is secure by default: least-privilege service user, restrictive
  file modes, no secrets in shell history or world-readable files, no unpinned
  remote scripts. The one exception is the official `omp` installer at
  `https://omp.sh/install`: it is downloaded to a private temp file, its SHA256
  is printed, and it runs only after explicit confirmation or `--yes`. Node and
  Caddy come from checksum-verified official tarballs.
- If you cannot meet a security requirement in the current phase, do not ship an
  insecure shortcut. Defer the feature and say so in the roadmap.

## 11. Testing requirements

- Backend and protocol behavior must have automated tests. Required every phase.
- Use `node:test`. Test HTTP endpoints, WebSocket connect and messaging,
  authentication success and failure, invalid input, and reconnect behavior.
- Test the wire protocol with a simulated client, independent of the Android
  UI. A protocol bug must be catchable without a phone.
- Keep the browser end-to-end harness green. It builds the same mobile UI for
  the browser, serves it from Caddy at the same origin as the API, and drives it
  with Playwright over HTTPS and WSS (`apps/android`). The local run uses Caddy's
  local CA, validated through the trust store, not a bypass
  (`installer/caddy/`). Run it against the public certificate on the VPS before
  claiming the TLS path works. It covers pairing, health and meta, the WebSocket
  handshake, `server.status`, the echo round trip, and reconnect after a
  control-plane restart.
- The browser build is the Phase 1 acceptance surface (ADR 0005). Android device
  testing is deferred with the APK: Keystore, the Android WebSocket, and the
  Android TLS stack are not exercised by the browser and must be tested when the
  APK is rebuilt.
- The web build keeps the device token in `localStorage` today. That is a known
  risk for a public browser deployment and is tracked for the cookie or
  in-memory token change before a public release.
- Test the process lifecycle rules that apply to the phase: restart without
  agent restart, backoff, orphan reconciliation, and duplicate-instance refusal
  (agent host phases).
- Test connection mode behavior: HTTP is off by default, needs an explicit
  enable, and nothing downgrades HTTPS to HTTP automatically.
- Run the dependency and integration suite on the chosen Node major (26, or 24
  as fallback) before declaring the runtime locked.
- Do not run tests, emulators, or browser automation unless the task asks for it.
  When asked, run them and report real results.
- Do not claim Android runtime testing happened unless it actually did. This
  build host has the Android SDK and one AVD but no `/dev/kvm`, so emulator
  testing is slow and unreliable. If emulator testing is not performed, say so
  explicitly and produce an installable APK instead.
- Every phase report must state: what passed, what was not possible, whether an
  emulator was available, whether an APK was produced, and what needs manual
  verification. Never mark the app "tested" from backend tests alone.

## 12. Documentation requirements

- `spec.md`, `roadmap.md`, and this file are living documents. Update them in the
  same change that alters architecture, scope, or conventions.
- Record architecture decisions in `docs/decisions/` as short ADRs. Every ADR
  has: context, decision, alternatives, consequences, status. Reverse a decision
  by adding a new ADR, not by deleting the old one.
- Record the runtime decision (Node 26 vs 24) as an ADR once Phase 1 verifies it.
- Update the "Current status" table in `roadmap.md` when a phase starts,
  completes, or is blocked.
- Prefer documenting reality over intent. If code and docs diverge, fix one.

## 13. Preserve the architecture

- When adding a feature, extend existing patterns. Do not introduce a second way
  to do something that already exists (a second HTTP client, a second event
  path, a second store).
- Do not refactor across module boundaries without a stated reason and an ADR.
- Do not "clean up" or restructure code that is unrelated to your task.
- If existing code looks wrong, note it. Do not silently rewrite it.
- Treat unfamiliar files as someone else's work. Investigate before changing or
  deleting.

## 14. Definition of done for a phase

A phase is done only when all of these hold:

1. Every deliverable in the roadmap for that phase exists and works.
2. The phase's completion criteria are met and demonstrated.
3. Required tests pass, and the report is honest about what was not tested.
4. Security requirements for that phase are met, not deferred.
5. `spec.md`, `roadmap.md`, and ADRs are updated.
6. No work from a later phase was pulled in, and nothing from an earlier phase
   was broken.
7. The report lists what to verify by hand and any remaining risks.

## 15. Commits, branches, and PRs

- Small, focused commits. One logical change each.
- Commit messages: imperative subject under about 72 characters, then what and
  why. No em dashes. Reference the phase, for example `phase1: add ws heartbeat`.
- PRs state the phase, the deliverable, the test evidence, and what was not
  tested. Keep them reviewable.
- Never commit secrets, tokens, keystores, `.env` files, or build output. Keep
  `.gitignore` current.
