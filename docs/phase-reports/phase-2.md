# Phase 2 status report

Status: In progress. The installer is verified on this VPS for domain and HTTP
modes, including rerun, uninstall, and a fresh reinstall. IP-only mode is
blocked by port 80. arm64 and musl are untested.

Date: 2026-11-11
Host: VPS at `13.63.44.162`, Ubuntu 26.04, amd64, glibc, Node 26.13.1.

## Delivered

- `installer/install.sh`: one command. Detects OS, architecture, libc, package
  manager, and systemd; selects the connection mode; installs Node 26 (24
  fallback) from a checksum-verified tarball; installs `omp` from the official
  installer and copies the binary to `/usr/local/bin`; builds and installs the
  control plane; builds the browser UI when the app dependencies are present;
  configures Caddy; installs both systemd units; starts the services; runs
  health checks; mints and prints a pairing code; writes an install marker for
  idempotent reruns.
- `installer/lib/`: common, detection, Node, omp, Caddy, mode selection, control
  plane, and health helpers.
- `installer/uninstall.sh`: stops and disables both services, removes the units
  and installed files, keeps or removes the data directory, removes the service
  user only if the installer created it, and leaves Node, omp, and Caddy alone.
- `installer/doctor.sh`: platform, Node, npm, omp, units, services, loopback and
  public health, DNS, ports, file permissions, disk, and journal checks.
- `installer/systemd/`: templated control plane and Caddy units. Caddy binds 80
  and 443 unprivileged through `CAP_NET_BIND_SERVICE`.
- `installer/caddy/`: domain, IP, and local fronts, with the mode guide.

## Verified on this VPS

- Full install, domain mode: `13-63-44-162.sslip.io` resolves to the public IP,
  Caddy obtained a Let's Encrypt certificate, both services are active and
  enabled, and `https://13-63-44-162.sslip.io/v1/health` returns 200.
- Browser end to end over the public certificate: pairing, health and meta, WSS
  hello, `server.status`, echo, and reconnect after `systemctl restart
  omp-console`. Two separate runs passed. See the Phase 1 report.
- Rerun: the installer found the marker, stopped the services, rebuilt the
  control plane, kept the paired devices and server id, reminted a code, and
  restarted both services. It also detected Node 26, omp, and Caddy 2.11.9 and
  skipped their installation.
- Uninstall with `--keep-data`: removed `/opt/omp-console`, both units, and the
  Caddy config; kept `/var/lib/omp-console` and the service user; both services
  inactive.
- Fresh reinstall after that uninstall: rebuilt and started everything, kept the
  three paired devices, and the printed pairing code matched the stored hash.
- HTTP mode: the control plane bound `0.0.0.0:8722`, Caddy was stopped and
  disabled, and `http://13.63.44.162:8722/v1/health` returned 200. Domain mode
  was restored afterwards.
- `doctor.sh`: 18 ok, 1 warning (disk usage 87%), 0 failures.
- omp: `omp/18.18.9` installed at `/usr/local/bin/omp`.

## Bugs found and fixed during this validation

- The service forced a new pairing code on first run, invalidating the code the
  installer printed. `apps/backend/src/index.ts` now mints only when no valid
  code exists.
- A running service flushes its in-memory store on shutdown, so minting a code
  with the CLI while the service runs and then restarting overwrites the new
  code. The documented order is now stop, mint, start. The installer mints
  before it starts the service, which is correct.
- The official omp installer wrote to `/root/.local/bin` under sudo. The
  installer now copies the binary to `/usr/local/bin/omp`.
- HTTP mode left the Caddy unit enabled. The installer now disables it when the
  mode is HTTP.
- Removed `MemoryDenyWriteExecute=true` from both units, because Node's JIT and
  Caddy's Go runtime should not be constrained by it.

## Not verified

- IP-only mode. Caddy listened locally on 80 and 443, but Let's Encrypt HTTP-01
  got `Connection refused` for `http://13.63.44.162`. The domain certificate
  succeeded through TLS-ALPN on 443, so port 443 is reachable and port 80 is
  not. The IP config is valid (Caddy 2.11.9, `shortlived`, `default_sni`,
  TLS-ALPN disabled). Open public TCP 80 and the same command should complete.
- arm64 and musl. This host is amd64 glibc and has no Docker or second machine.
- A clean container or VM. The full lifecycle was run on this VPS instead.
- The Android APK, by product decision.

## Remaining to close Phase 2

1. Open public TCP 80, then rerun `--mode ip --public-ip 13.63.44.162` and
   confirm the IP certificate.
2. Test on arm64 and musl, ideally in disposable containers.
3. Decide whether the unpinned official `omp` installer is acceptable, or pin a
   version once one is published.
4. Move the web device token out of `localStorage` before a public release. This
   is a Phase 3 security item, but it is the main residual risk in the current
   browser surface.

## How to run

```sh
sudo ./installer/install.sh --mode domain --domain console.example.com \
  --email you@example.com --yes
sudo ./installer/doctor.sh
sudo ./installer/uninstall.sh --keep-data
```

See `installer/README.md` for IP, private-network, and HTTP modes.