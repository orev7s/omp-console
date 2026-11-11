# OMP Console installer

One command on a Linux VPS. It detects the platform, installs Node LTS and
`omp`, builds and installs the control plane, configures Caddy for the chosen
connection mode, installs the systemd units, starts the services, runs health
checks, and prints a pairing code.

The installer is source-based for Phase 2. Clone the repo on the VPS, then run
it from the checkout. A hosted one-liner belongs with the later onboarding work.

## Quick start

Domain with a trusted certificate (recommended):

```sh
git clone <repo> omp-console
cd omp-console
sudo ./installer/install.sh --mode domain --domain console.example.com \
  --email you@example.com --yes
```

Bare IP with a Let's Encrypt IP certificate:

```sh
sudo ./installer/install.sh --mode ip --yes
```

Private network (Tailscale or WireGuard):

```sh
sudo ./installer/install.sh --mode private \
  --private-host myhost.tailnet.ts.net --yes
```

Direct HTTP (unencrypted, explicit opt-in):

```sh
sudo ./installer/install.sh --mode http --yes
```

Without `--yes` the installer prompts for the missing values and asks before
running the official `omp` installer. Without `--mode` it shows a menu.

## Requirements by mode

| Mode | Needs |
| --- | --- |
| domain | A DNS A/AAAA record pointing at the host, TCP 80 and 443 reachable, an optional ACME email. |
| ip | A public IPv4 on the host, TCP 80 reachable. Caddy 2.10.1 or newer, installed by the installer if missing. |
| private | A private network that resolves the given hostname. Tailscale needs HTTPS enabled for the tailnet. |
| http | Nothing beyond the chosen port. Traffic and credentials are unencrypted. |

The installer checks DNS and local port conflicts and warns. It cannot open the
cloud provider's security group. Open TCP 80 and 443 there for the TLS modes.

## What it installs

| Path | Contents |
| --- | --- |
| `/opt/omp-console` | Built control plane, production `node_modules`, the browser UI when built. |
| `/var/lib/omp-console` | `config.json` (0600), `state.json` with paired devices and the server id (0700). |
| `/etc/omp-console/install.env` | Install marker (0600) used by reruns, `doctor.sh`, and `uninstall.sh`. |
| `/etc/systemd/system/omp-console.service` | Control plane unit. |
| `/etc/systemd/system/omp-console-caddy.service` | Caddy unit (TLS modes). |
| `/etc/caddy/omp-console/` | `Caddyfile` and `caddy.env` (0640). |
| `/usr/local/bin/caddy` | Caddy 2.11.9 when the system Caddy is older than 2.10.1. |
| `/usr/local/lib/nodejs/` | Node 26 when the system Node is not 24 or 26. |

It does not install the agent host. That is Phase 4. The control plane runs with
`omp` absent.

## Options

```
--mode domain|ip|private|http
--domain NAME
--email ADDRESS
--public-ip ADDRESS
--private-host NAME
--source-dir DIR
--prefix DIR
--data-dir DIR
--config-dir DIR
--port PORT
--user NAME
--with-web auto|yes|no
--no-omp
--no-pairing
--yes, -y
--dry-run
--help
```

`--with-web auto` uses an existing `apps/android/web/dist`, builds it when
`apps/android/node_modules` is present, and otherwise skips it with a warning.
The phone app still works. To serve the browser UI, run
`cd apps/android && npm ci && npm run build:web` and rerun with
`--with-web yes`.

## Pairing

The installer mints a single-use pairing code with the control plane CLI and
prints it once. It is not written to a file. Mint a new one with:

```sh
sudo -u omp-console env \
  OMP_CONSOLE_DATA_DIR=/var/lib/omp-console \
  OMP_CONSOLE_CONFIG=/var/lib/omp-console/config.json \
  /usr/local/bin/node /opt/omp-console/apps/backend/dist/src/cli.js pair
sudo systemctl restart omp-console
```

Restart the service after minting. The running process keeps the code it loaded at
startup, so a new code written to the store is only seen after a restart.

## Idempotency and updates

Rerunning the installer updates the code and config in place. It keeps
`state.json`, so paired devices and the server id survive. It stops the services
before checking ports and starts them again after the update. It writes the
config atomically and refuses partial config.

If you used custom `--prefix`, `--data-dir`, `--config-dir`, or `--user`, rerun
with the same flags. The marker records them, but the marker itself lives in the
config directory, so a changed `--config-dir` will not find the old one.

## Security notes

- The control plane runs as a dedicated system user, binds loopback by default,
  and the unit is hardened. NoNewPrivileges, ProtectSystem, ProtectHome, a
  restricted address family set, and a read-only filesystem are enabled.
- The device token and pairing code are never written to the install marker or
  the process arguments. The pairing code is printed to the terminal once.
- Config is 0600, data is 0700, Caddy env is 0640.
- `omp` is installed through the official `https://omp.sh/install` script. That
  script is downloaded to a private temp file, its SHA256 is printed, and it is
  only run after confirmation or `--yes`. It is not pinned. If you need a pinned
  `omp`, install it yourself and rerun with `--no-omp`.
- Node and Caddy tarballs are verified against their published checksums.
- HTTP mode is never the default. It requires `--mode http` and `--yes` or an
  interactive confirmation, and the summary prints a warning.

## Diagnostics and removal

```sh
sudo ./installer/doctor.sh
sudo ./installer/uninstall.sh --keep-data
sudo ./installer/uninstall.sh --purge
```

`doctor.sh` checks the platform, Node, omp, services, loopback and public
health, DNS, ports, file permissions, disk space, and recent journal errors.

The installer scripts are also copied to `/opt/omp-console/installer` during
install, so the one-command bootstrap leaves a stable `doctor.sh` and
`uninstall.sh` behind.

`uninstall.sh` removes the units and installed files. It keeps the data
directory with `--keep-data`. It removes the service user only if this installer
created it. It leaves Node, omp, and the Caddy binary in place because other
software may use them.

## Tested and not tested

Verified on this host (Ubuntu 26.04, amd64, glibc, Node 22):

- `bash -n` on every script.
- Dry runs for domain, IP, and HTTP modes, and for the uninstaller.
- The installer's build path in a temp directory: `npm ci`, protocol and backend
  builds, a production-only `npm ci`, and the CLI entry point.
- `doctor.sh` against a host with no install, which correctly reports the
  missing unit, service, health, and files.

Not verified here:

- A clean container or VM, and arm64 or musl. The roadmap requires both. This
  host has no Docker and no second architecture.
- A real `omp` installation. It is skipped with `--no-omp` because the Phase 2
  control plane does not need it.
- A publicly trusted certificate. This host has no domain, its public IP is
  NAT-mapped, and ports 80 and 443 are not open.
- A full install on this host, because it would replace the system Node and
  Caddy and start the services. The dry runs and the temp build cover the logic
  without changing the machine.

The installer writes no test output to the repo. `doctor.sh` exits nonzero if a
hard check fails.