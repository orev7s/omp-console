# ADR 0002: Oh My Pi integrates over RPC in a separate agent host

Status: Accepted. Implemented in Phase 4.
Date: 2026-11-11

## Context

Oh My Pi exposes an in-process SDK (Bun-only) and an RPC mode
(`omp --mode rpc`), a newline-delimited JSON protocol over stdio. The product
requires that restarting the management service not restart the agent, and that
an agent crash not take down the control plane.

## Decision

Integrate over RPC by spawning the `omp` binary as a supervised child process.
Do not use the in-process SDK. Own the `omp` children in a separate long-lived
process ("agent host") that the control plane talks to over a local Unix socket
(L2 protocol). The control plane never spawns `omp` and never sees OMP frames.

## Alternatives

- In-process SDK: rejected. It puts `omp` inside the backend's failure and
  memory boundary, which breaks the process isolation and restart-independence
  requirements.
- RPC inside the control plane: rejected. Because RPC is stdio, the child dies
  when its parent dies, so a control-plane restart would kill the agents.

## Consequences

- One extra long-lived process and an internal socket protocol, both from
  Phase 4. Phase 1 stays a single process.
- Each proposed mechanism (ownership, restart without agent restart, session
  adoption, orphan handling, backoff) must be validated against actual Oh My Pi
  behavior in Phase 4, not assumed.
- We implement our own thin TypeScript RPC client rather than depending on the
  Bun-only `@oh-my-pi/pi-coding-agent` package.
