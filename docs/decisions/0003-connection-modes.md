# ADR 0003: Four connection modes with HTTP as an explicit opt-in

Status: Accepted.
Date: 2026-11-11

## Context

Users have different constraints: some have a domain, some only a public IP,
some can use a private network, and some do not want to configure TLS at all.
The product must not strand IP-only users, and must not silently weaken security.

## Decision

Support four connection modes, selected per server:

1. Direct HTTP by IP or host. Disabled by default, explicit opt-in with
   confirmation, clear warning, never a silent downgrade, changeable later.
2. HTTPS with a publicly trusted Let's Encrypt IP certificate through Caddy.
3. HTTPS with a domain certificate through Caddy.
4. HTTPS through a private network (Tailscale/WireGuard).

Caddy is the default TLS front and the Node backend binds to loopback by
default. The server refuses a plaintext public bind unless the operator
explicitly enables it.

## Alternatives

- HTTPS only: rejected by product decision. It would strand users who have only
  an IP and choose not to configure a certificate.
- HTTP by default: rejected. It would weaken security silently.

## Consequences

- The app must present mode selection clearly and never downgrade automatically.
- The server needs an explicit insecure-http flag and a loud startup warning.
- Pairing over HTTP is the highest-risk case and is called out in the UI.
