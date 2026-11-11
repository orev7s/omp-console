# ADR 0001: Backend runtime is Node.js 26 LTS (Node 24 LTS fallback)

Status: Accepted. Verified on Node 26.13.1.
Date: 2026-11-11

## Context

OMP Console has two Node services on the server: the control plane and (from
Phase 4) the agent host. Oh My Pi itself ships an in-process SDK, but that SDK is
Bun-only ("not a Node.js SDK") and shares the host process. We chose to integrate
over Oh My Pi's RPC mode instead (see ADR 0002), which is runtime independent and
gives us a real process boundary.

Because the integration is RPC over stdio, we are not forced onto Bun. We must
still choose the runtime for our own services.

## Decision

Target Node.js 26 LTS. Node.js 24 LTS is the fallback if a dependency or an
integration test does not support 26. Do not pin to Node 22 without a documented
compatibility reason.

The `engines` field uses `>=24` so the project is not locked to a single major.
The decision is verified on Node 26.13.1: the protocol and backend typecheck
are clean, and all 26 backend tests pass, including the HTTP, WebSocket,
lifecycle, and connection-mode cases.

## Verification

- Date: 2026-11-11.
- Runtime: Node v26.13.1, npm 11.20.0, on Ubuntu 26.04 amd64 glibc.
- Commands: `npm test` and `npm run typecheck` at the repository root.
- Result: 26 tests passed, 0 failed; both typechecks clean.

## Alternatives

- Bun: fewer dependencies (built-in HTTP, WebSocket, SQLite, Argon2), same
  runtime family as Oh My Pi, and it keeps the in-process SDK available. Rejected
  as the default because a control plane that must stay up on an arbitrary VPS
  benefits more from Node's maturity and ubiquity. Revisit if we adopt the SDK or
  want a zero-dependency HTTP and WebSocket stack.
- Node.js 22: rejected as a baseline because it is not the current target and
  there is no compatibility reason to stay on it.

## Consequences

- We depend on Node LTS behavior and the `node:` standard library.
- The only significant runtime dependency for HTTP and WebSocket is `ws`.
- Verification against Node 26 (or 24) is a required Phase 1 task; if it fails,
  this ADR is revisited rather than silently changed.
