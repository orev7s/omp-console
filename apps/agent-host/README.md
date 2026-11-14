# Agent host

The only component that knows Oh My Pi. It owns every `omp` child, translates
OMP RPC into our L2 event model, and exposes a local Unix socket to the control
plane. The control plane never spawns `omp` and never sees OMP frames.

## Shape

- One `omp --mode rpc` child per session, started lazily on the first request.
- L2 socket at `OMP_AGENT_HOST_SOCKET`, mode 0600. Callers are trusted by
  socket permissions.
- One instance per host, enforced by an exclusive lock file. A second instance
  exits with a clear error.
- Crash restart with exponential backoff, jitter, and a circuit breaker. A
  session that keeps failing ends in `failed` instead of flapping.
- Orphan reconciliation on startup from an atomic child registry.
- Protocol v2 negotiation when advertised, with strict `rpc_chunk` reassembly.

## Run

```sh
npm run build -w @omp-console/agent-host
npm run start -w @omp-console/agent-host
```

`probe` spawns one real child, prints the ready frame and session state, then
shuts it down:

```sh
OMP_AGENT_HOST_MODEL=kilofree/kilo-auto/free \
  npm run probe -w @omp-console/agent-host
```

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `OMP_AGENT_HOST_BIN` | `omp` | Binary to spawn. |
| `OMP_AGENT_HOST_MODEL` | none | Model selector for new sessions. |
| `OMP_AGENT_HOST_RUNTIME_DIR` | `$TMPDIR/omp-console-agent-host` | Socket, lock, child registry. |
| `OMP_AGENT_HOST_DATA_DIR` | `~/.local/share/omp-console` | Durable data root. |
| `OMP_AGENT_HOST_SESSIONS_DIR` | `$DATA_DIR/sessions` | Session index and per-session homes. |
| `OMP_AGENT_HOST_CONFINEMENT` | `unrestricted` | `unrestricted` or `restricted`. |
| `OMP_AGENT_HOST_MAX_RESTARTS` | `5` | Restart attempts before the circuit opens. |
| `OMP_AGENT_HOST_RESTART_BASE_MS` | `500` | First backoff delay. |
| `OMP_AGENT_HOST_RESTART_MAX_MS` | `30000` | Backoff ceiling. |
| `OMP_AGENT_HOST_LOG_LEVEL` | `info` | Log threshold. |

## Confinement

`unrestricted` runs `omp` as the service user with host access.

`restricted` runs each child inside bubblewrap with a writable tmpfs root, the
workspace and a per-session home writable, the system runtime read-only, and the
resolver file bound so DNS works. The agent still needs outbound network for
model providers. If `bwrap` is missing, the host refuses to start a restricted
child rather than fall back to unrestricted.

Restricted mode seeds `models.yml` and `.env` from `~/.omp/agent` into the
per-session home. OAuth credentials in `agent.db` are not copied.

## Test with a real omp

The integration tests drive the installed binary, not a stub. They need a model
that responds. On this host the keyless Kilo AI Gateway model is used.

Add this to `~/.omp/agent/models.yml`:

```yaml
providers:
  kilofree:
    baseUrl: https://api.kilo.ai/api/gateway/v1
    api: openai-completions
    auth: none
    models:
      - id: kilo-auto/free
        name: Kilo Auto Free
        contextWindow: 128000
        maxTokens: 8192
```

Then:

```sh
npm run test:agent-host
```

The suite skips only when `OMP_AGENT_HOST_E2E=0`. Override the model with
`OMP_TEST_MODEL` and the binary with `OMP_TEST_BIN`.

Kilo free models are rate limited (200 requests per hour per IP) and may route
to partner endpoints that log prompts. Do not send sensitive data through them.