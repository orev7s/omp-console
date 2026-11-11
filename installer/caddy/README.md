# Caddy front for OMP Console

Caddy is the TLS reverse proxy (decision D8 in `spec.md`). The control plane
binds loopback and speaks plaintext only there. Caddy terminates TLS with a
publicly trusted certificate and forwards `/v1`, including the WebSocket
upgrade, to `127.0.0.1:8722`. The same origin also serves the built mobile UI,
so the browser client needs no CORS and the WebSocket shares the origin.

The mobile app remains the primary client. The browser build is the same
mobile-first UI, not a separate product. It exists so the console can be used
and tested without installing an APK or running an emulator.

Phase 1 ships the configuration and documents the paths. Automated
installation, DNS checks, and the Caddy service unit are Phase 2.

## Files

| File | Use |
| --- | --- |
| `Caddyfile` | Domain mode. The default. A DNS name points at the host. |
| `Caddyfile.ip` | Bare IP mode. Needs Caddy 2.10.1 or newer. |
| `Caddyfile.local` | Local verification and the HTTPS end-to-end run. Uses Caddy's local CA. Never deploy this one. |

## Domain mode (default)

1. Point an A (and AAAA if used) record at the host.
2. Open public TCP ports 80 and 443.
3. Build the web UI: `cd apps/android && npm run build:web`. The output is
   `apps/android/web/dist`.
4. Set the environment for the Caddy process:

   ```
   OMP_CONSOLE_DOMAIN=console.example.com
   OMP_CONSOLE_WEB_ROOT=/opt/omp-console/web
   OMP_CONSOLE_UPSTREAM=127.0.0.1:8722
   OMP_CONSOLE_ACME_EMAIL=you@example.com
   ```

5. Run `caddy run --config installer/caddy/Caddyfile --adapter caddyfile`.

Caddy obtains and renews the certificate automatically. If port 80 is not
reachable, HTTP-01 fails and there is no trusted certificate. That is a network
requirement, not something the config can work around.

## Bare IP mode

Use `Caddyfile.ip` when there is no domain. Set `OMP_CONSOLE_PUBLIC_IP`, plus
the same web root and upstream. Requirements:

- Caddy 2.10.1 or newer. The build host here has 2.6.2, which cannot do IP
  certificates, so this path was not exercised here. On 2.6.2 the config fails
  to load with `unrecognized ACME issuer property: profile`. The file does
  validate with Caddy 2.11.9, but no public certificate was obtained on this
  host because its IP is NAT-mapped and port 80 is not open.
- Public port 80 reachable, for HTTP-01.
- A real public IP, not NAT without forwarding.

The certificate lasts about six days and Caddy renews it. Do not try to renew
it by hand.

## Private network mode

Point the site address at the host's `*.ts.net` name (Tailscale) or serve over
WireGuard. Caddy asks the local Tailscale daemon for a trusted certificate at
handshake time. HTTPS must be enabled for the tailnet, and the Caddy process
needs permission to fetch certificates. Use the same body as `Caddyfile` with
the `*.ts.net` address; no ACME email is required.

This path was not exercised here because Tailscale is stopped on this host.

## Direct HTTP mode

This is not a Caddy mode. The control plane binds a public interface over
plaintext only when the operator explicitly enables it:

```
OMP_CONSOLE_HOST=0.0.0.0
OMP_CONSOLE_INSECURE_HTTP=1
```

It logs a loud startup warning, and the app requires explicit selection and
acknowledgement. Never make this the default and never fall back to it.

## Local verification (no domain, no public ports)

`Caddyfile.local` exists so the full HTTPS and WSS path can be checked on a
machine that cannot get a public certificate. It uses Caddy's local CA, so the
certificate is validated through the trust store, not bypassed.

```
cd apps/android && npm run build:web
OMP_CONSOLE_WEB_ROOT=$PWD/web/dist \
OMP_CONSOLE_UPSTREAM=127.0.0.1:8722 \
caddy run --config ../../installer/caddy/Caddyfile.local --adapter caddyfile
```

On first use Caddy installs its local root CA into the NSS store and the system
bundle. If that fails, run `caddy trust` once. Then `https://localhost:8443`
serves the UI and proxies `/v1` to the control plane. This is what
`npm run e2e:web` uses.

This is a verification path. It is not a publicly trusted certificate, so it
does not satisfy the production requirement on its own.

## What is still missing in Phase 1

The repo had no Caddy front before this change. It now has the configuration and
a real HTTPS/WSS run through Caddy. All three configs validate with Caddy
2.11.9; the host's installed 2.6.2 can run the domain and local configs but not
the IP one. A publicly trusted certificate still needs a host with a domain or a
public IP and open ports 80 and 443. That is an environment requirement, and it
is the remaining item on completion criterion 2.