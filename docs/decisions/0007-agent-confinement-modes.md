# 0007 - Agent confinement modes (restricted and unrestricted)

Status: Accepted (Phase 4). Mechanism decided 2026-11-11.
Date: 2026-11-11

## Context

Users want two server-level behaviors. Some want the agent to run with full
access to the VPS, exactly like a normal `omp` install. Others want the agent
confined to one folder, so a bad tool call or a confused model cannot touch the
rest of the server.

Oh My Pi exposes several knobs that look like confinement but are not a security
boundary on their own: `--cwd` and `--add-dir` set the starting and extra
workspace directories; `--tools` and `--no-tools` select tools; `--no-pty`
disables PTY bash; `--profile` isolates auth, sessions, settings, and caches;
`--approval-mode` (always-ask, always-ask-cached, write, yolo) controls tool
approval. The built-in tools (read, edit, write, bash, lsp) are scoped to the
working directory, but a shell tool can still reach absolute paths outside it
unless the OS confines the process.

Confinement has to be a process-level, OS-enforced boundary in the agent host,
which is the only component that spawns `omp`.

## Decision

A server-level setting with two values, enforced at `omp` spawn time in the agent
host:

- `unrestricted`: no sandbox. `omp` runs as the agent user with host access. This
  is the default for a fresh install, matching a normal `omp` install and the
  current behavior.
- `restricted`: each `omp` child runs inside a bubblewrap (`bwrap`) sandbox bound
  to one workspace directory. The sandbox bind-mounts that directory read-write,
  the runtime (`/usr`, `/lib`, the `omp` binary) read-only, and a private `/tmp`,
  then drops to a dedicated unprivileged uid. Host home, other projects, and
  control-plane data are not visible.

Granularity: the mode is a server default with a per-project override. The
server-level value lands with Phase 4. The per-project override lands with the
project registry (Phase 7), or sooner if a project config key is added.

Backstop: a dedicated unprivileged agent user plus systemd hardening
(`ProtectSystem=strict`, `ReadWritePaths=<workspace>`, `ProtectHome=yes`,
`PrivateTmp`, `NoNewPrivileges`). If `restricted` is selected and bubblewrap is
unavailable, the agent host refuses to start the child with a clear error. It
never falls back to `unrestricted` silently.

`omp`'s own per-session knobs (`--cwd`, `--profile`, `--session-dir`, `--tools`,
`--no-pty`, `--approval-mode`) are set inside the agent host as well, layered on
top of the OS boundary, not a substitute for it.

## Alternatives

- Do nothing and document the risk. Rejected: the request is explicit, and the
  folder boundary is the main safety story for cautious users.
- Use `--cwd` and tool scoping alone. Rejected: not a security boundary.
- Deny network in restricted mode. Rejected: the agent needs outbound access to
  model providers. Network confinement would need a local model proxy, which is
  future work.
- Systemd hardening only, with no extra binary. Rejected as the primary
  mechanism: it restricts the whole agent service, so it cannot give each project
  its own boundary. Kept as the backstop.
- Docker or Podman. Rejected as the default: a daemon, an image, and stdio RPC
  plumbing across the container boundary is more machine than the problem needs.
  Kept as a possible future mode.

## Consequences

- The installer gains an optional dependency (bubblewrap) and verifies kernel
  support for unprivileged user namespaces.
- The agent host gains a sandbox module and a server config value. The control
  plane and the app only carry and display the mode.
- Restricted mode has to be verified against a real `omp` run, not assumed:
  confirm the agent can still reach model providers and write inside the
  workspace, and cannot read outside it.
- The active mode must be visible in the app, so the user always knows which one
  is running.
- Per-project overrides are inert until the project registry exists (Phase 7).
