# Phase 4 report - Oh My Pi integration layer and agent host

Status: Done, 2026-11-11.
Runtime: Node.js 26.13.1. Real `omp` v18.18.9.

## What shipped

- `packages/agent-protocol`: the L2 envelope, request and response schemas,
  normalized session events, agent status, session info, and capabilities.
- `apps/agent-host`: a separate service that owns every `omp` child.
  - `rpc/`: spawn, `ready`, protocol v2 negotiation, strict `rpc_chunk`
    reassembly, response correlation by `id`, per-command timeouts,
    cancellation, stdout drain after stdin closes, SIGTERM then SIGKILL.
  - `sessions/`: one child per session, lazy start, durable index, `open_session`
    adoption, prompt, abort, close.
  - `supervisor/`: exponential backoff with jitter and a circuit breaker, a
    single-instance lock, process groups, an atomic child registry, and orphan
    reconciliation on startup.
  - `events/`: the single translator from OMP frames to the L2 event model.
    Unknown frames are ignored, never fatal.
  - `capabilities/`: `omp --version` and the startup command list.
  - `sandbox/`: bubblewrap command construction for `restricted` mode, plus the
    PATH resolution and resolver bindings that make a real confined session
    work.
  - `server/`: the L2 Unix socket, mode 0600, NDJSON, subscriptions, slow-client
    disconnect.
- Control plane: `agenthost/client.ts`, a reconnecting L2 client that reports
  agent state. `/v1/meta` and the `server.status` event now carry the real agent
  state and the omp version instead of a hardcoded `unavailable`.
- Installer and systemd: `omp-console-agent-host.service.in`, agent host build
  and install, shared runtime directory, uninstall handling.

## Verification

Command: `npm run test:all`

- Backend: 36 pass.
- Agent host: 20 pass.
- Typecheck: protocol, agent-protocol, backend, agent host.
- Installer scripts: `bash -n` passes.

Real-binary coverage, not stubs:

- One prompt through `omp --mode rpc` over the keyless Kilo AI Gateway model
  `kilofree/kilo-auto/free` (`https://api.kilo.ai/api/gateway/v1`, `auth: none`).
- The L2 Unix socket drives a real session: create, subscribe, abort, prompt,
  receive `agent.start` and `prompt.result`, close, status.
- `restricted` mode runs a full real session with a prompt inside bubblewrap.
- A killed child restarts with backoff and a new pid.
- A control-plane reconnect does not change the child pid.
- Orphan reconciliation kills a leftover process group.

The only synthetic test is the decoder unit test. It exercises our `rpc_chunk`
math, which the real binary does not emit for small frames. There is no fake
`omp` anywhere.

## Completion criteria

- Backend starts `omp`, sends a prompt, streams events, aborts, and recovers from
  a crash: verified.
- Agent process isolated from the control plane: separate service and L2 socket.
- Control plane restartable without restarting the agent: verified by the
  reconnect test (pid unchanged).
- Process model: lock, process groups, runtime-state reconciliation, backoff,
  circuit breaker, lazy start.

## Not verified

- A full installer run on a fresh host. The live deployment here was not
  disturbed, so the two units are syntax-checked and typechecked but not
  deployed.
- The `restricted` per-project override is Phase 7 (no project registry yet).
- A real Android device. That remains with the APK work.

## Known gaps

- Restricted mode seeds only `models.yml` and `.env` into the sandbox home. OAuth
  provider credentials in `agent.db` are not copied, so OAuth-based providers
  need a login step inside the confined profile later.
- Confinement is filesystem-only by design. The agent still needs outbound
  network to reach model providers.
- The agent host unit runs with `ProtectSystem=full` and `ProtectHome=false` so
  `unrestricted` agents can reach the host. That is intentional and documented
  in the unit.

## Next

Phase 5: the L1 session and chat endpoints, plus the streaming UI on top of the
L2 session events. The agent host already emits what the UI needs.