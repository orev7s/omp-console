#!/usr/bin/env bash
# OMP Console installer.
#
# One command on a Linux VPS: detects the platform, installs Node LTS and omp,
# builds and installs the control plane, configures Caddy for the chosen
# connection mode, installs the systemd units, starts the services, runs health
# checks, and prints the pairing code.
#
# Idempotent: rerunning updates the code and config in place and keeps paired
# devices and the server id.

set -Eeuo pipefail

SCRIPT_PATH="${BASH_SOURCE[0]}"
INSTALLER_DIR="$(cd "$(dirname "${SCRIPT_PATH}")" && pwd)"
SOURCE_DIR="$(cd "${INSTALLER_DIR}/.." && pwd)"

# shellcheck disable=SC1091
. "${INSTALLER_DIR}/lib/common.sh"
# shellcheck disable=SC1091
. "${INSTALLER_DIR}/lib/detect.sh"
# shellcheck disable=SC1091
. "${INSTALLER_DIR}/lib/modes.sh"
# shellcheck disable=SC1091
. "${INSTALLER_DIR}/lib/node.sh"
# shellcheck disable=SC1091
. "${INSTALLER_DIR}/lib/omp.sh"
# shellcheck disable=SC1091
. "${INSTALLER_DIR}/lib/caddy.sh"
# shellcheck disable=SC1091
. "${INSTALLER_DIR}/lib/health.sh"

trap cleanup_temp_dirs EXIT
trap 'code=$?; log_error "Installer failed near line ${BASH_LINENO[0]:-?} (exit ${code})."; log_error "Fix the error and rerun. Any existing services may be stopped."; exit "${code}"' ERR

WEB_MODE=""
SKIP_OMP=0
NO_PAIRING=0
SERVICE_USER_CREATED=""

usage() {
  cat >&2 <<'EOF'
Usage: sudo ./installer/install.sh [options]

Connection mode:
  --mode domain|ip|private|http   Select the connection mode (prompts if omitted).
  --domain NAME                   Domain for domain mode, e.g. console.example.com.
  --email ADDRESS                 ACME account email (domain and IP modes).
  --public-ip ADDRESS             Public IPv4 for IP and HTTP modes. Detected if omitted.
  --private-host NAME             Tailscale or WireGuard hostname for private mode.

Install:
  --source-dir DIR                Repo root to build from. Default: the installer's parent.
  --prefix DIR                    Install directory. Default: /opt/omp-console.
  --data-dir DIR                  Data directory. Default: /var/lib/omp-console.
  --config-dir DIR                Config and marker directory. Default: /etc/omp-console.
  --port PORT                     Control plane port. Default: 8722.
  --user NAME                     Service user. Default: omp-console.
  --with-web auto|yes|no          Build and serve the browser UI. Default: auto.
  --no-omp                        Do not install omp. The control plane does not need it yet.
  --no-pairing                    Do not mint or print a pairing code.

Behaviour:
  --yes, -y                       Non-interactive. Required for direct HTTP mode.
  --dry-run                       Print actions without changing the system.
  --help, -h                      Show this help.

Examples:
  sudo ./installer/install.sh --mode domain --domain console.example.com --email you@example.com --yes
  sudo ./installer/install.sh --mode ip --yes
  sudo ./installer/install.sh --mode private --private-host myhost.tailnet.ts.net --yes
  sudo ./installer/install.sh --mode http --yes

After install:
  sudo ./installer/doctor.sh
  sudo ./installer/uninstall.sh
EOF
}

need_value() {
  [ "$#" -ge 2 ] || die "Option $1 needs a value."
}

parse_args() {
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --mode)
        need_value "$@"
        MODE="$2"
        shift 2
        ;;
      --domain)
        need_value "$@"
        DOMAIN="$2"
        shift 2
        ;;
      --email)
        need_value "$@"
        EMAIL="$2"
        shift 2
        ;;
      --public-ip)
        need_value "$@"
        PUBLIC_IP="$2"
        shift 2
        ;;
      --private-host)
        need_value "$@"
        PRIVATE_HOST="$2"
        shift 2
        ;;
      --source-dir)
        need_value "$@"
        SOURCE_DIR="$2"
        shift 2
        ;;
      --prefix)
        need_value "$@"
        PREFIX="$2"
        shift 2
        ;;
      --data-dir)
        need_value "$@"
        DATA_DIR="$2"
        shift 2
        ;;
      --config-dir)
        need_value "$@"
        CONFIG_DIR="$2"
        shift 2
        ;;
      --port)
        need_value "$@"
        PORT="$2"
        shift 2
        ;;
      --user)
        need_value "$@"
        SERVICE_USER="$2"
        shift 2
        ;;
      --with-web)
        need_value "$@"
        WEB_MODE="$2"
        shift 2
        ;;
      --no-omp | --skip-omp)
        SKIP_OMP=1
        shift
        ;;
      --no-pairing)
        NO_PAIRING=1
        shift
        ;;
      --yes | -y)
        ASSUME_YES=1
        shift
        ;;
      --dry-run)
        DRY_RUN=1
        shift
        ;;
      --help | -h)
        usage
        exit 0
        ;;
      *)
        die "Unknown option: $1. Run $0 --help."
        ;;
    esac
  done
}

load_marker() {
  [ -r "$MARKER" ] || return 0
  log_info "Existing install found at ${MARKER}. Updating in place."
  PREFIX="${PREFIX:-$(read_marker "$MARKER" PREFIX || true)}"
  DATA_DIR="${DATA_DIR:-$(read_marker "$MARKER" DATA_DIR || true)}"
  CONFIG_DIR="${CONFIG_DIR:-$(read_marker "$MARKER" CONFIG_DIR || true)}"
  SERVICE_USER="${SERVICE_USER:-$(read_marker "$MARKER" SERVICE_USER || true)}"
  PORT="${PORT:-$(read_marker "$MARKER" PORT || true)}"
  WEB_MODE="${WEB_MODE:-$(read_marker "$MARKER" WEB_MODE || true)}"
  MODE="${MODE:-$(read_marker "$MARKER" MODE || true)}"
  DOMAIN="${DOMAIN:-$(read_marker "$MARKER" DOMAIN || true)}"
  EMAIL="${EMAIL:-$(read_marker "$MARKER" EMAIL || true)}"
  PUBLIC_IP="${PUBLIC_IP:-$(read_marker "$MARKER" PUBLIC_IP || true)}"
  PRIVATE_HOST="${PRIVATE_HOST:-$(read_marker "$MARKER" PRIVATE_HOST || true)}"
  SERVICE_USER_CREATED="${SERVICE_USER_CREATED:-$(read_marker "$MARKER" SERVICE_USER_CREATED || true)}"
}

stop_existing_services() {
  if [ ! -r "$MARKER" ] &&
    [ ! -f /etc/systemd/system/omp-console.service ] &&
    [ ! -f /etc/systemd/system/omp-console-caddy.service ]; then
    return 0
  fi
  log_info "Stopping existing services for the update."
  if service_active omp-console-caddy; then
    run systemctl stop omp-console-caddy
  fi
  if service_active omp-console; then
    run systemctl stop omp-console
  fi
  if ! dry_run; then
    sleep 1
  fi
}

validate_paths() {
  case "$PREFIX" in
    /*) ;;
    *) die "--prefix must be an absolute path." ;;
  esac
  case "$DATA_DIR" in
    /*) ;;
    *) die "--data-dir must be an absolute path." ;;
  esac
  case "$CONFIG_DIR" in
    /*) ;;
    *) die "--config-dir must be an absolute path." ;;
  esac
  [ "$PREFIX" != "/" ] || die "--prefix cannot be /."
  [ "$DATA_DIR" != "/" ] || die "--data-dir cannot be /."
  case "$PORT" in
    '' | *[!0-9]*) die "--port must be a number." ;;
  esac
  [ "$PORT" -ge 1 ] && [ "$PORT" -le 65535 ] || die "--port must be 1 to 65535."
  printf '%s' "$SERVICE_USER" | grep -qE '^[a-z_][a-z0-9_-]*$' || die "--user must be a lowercase system user name."
  [ "$SERVICE_USER" != "root" ] || die "Refusing to run the control plane as root. Use a dedicated service user."
}

write_install_marker() {
  write_marker "$MARKER" \
    "MODE=${MODE}" \
    "DOMAIN=${DOMAIN}" \
    "EMAIL=${EMAIL}" \
    "PUBLIC_IP=${PUBLIC_IP}" \
    "PRIVATE_HOST=${PRIVATE_HOST}" \
    "PREFIX=${PREFIX}" \
    "DATA_DIR=${DATA_DIR}" \
    "CONFIG_DIR=${CONFIG_DIR}" \
    "SERVICE_USER=${SERVICE_USER}" \
    "SERVICE_USER_CREATED=${SERVICE_USER_CREATED:-0}" \
    "PORT=${PORT}" \
    "WEB_MODE=${WEB_MODE}" \
    "CONNECTION_MODE=${CONNECTION_MODE}" \
    "PUBLIC_URL=${PUBLIC_URL}" \
    "NODE_VERSION=$(node -v 2>/dev/null || echo unknown)" \
    "OMP_VERSION=${OMP_VERSION:-}" \
    "INSTALLED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}

main() {
  if ! dry_run; then
    require_root "$@"
  fi
  need_cmd curl
  need_cmd tar
  need_cmd sha256sum
  need_cmd sha512sum

  [ -f "$SOURCE_DIR/package.json" ] || die "Source directory ${SOURCE_DIR} is not the OMP Console repo."
  [ -d "$SOURCE_DIR/apps/backend" ] || die "apps/backend is missing from ${SOURCE_DIR}."

  detect_platform
  require_supported_platform
  log_info "Host: ${OS_ID} ${OS_VERSION} (${ARCH}, ${LIBC}), package manager ${PKG_MANAGER}."

  select_mode
  stop_existing_services
  validate_mode
  print_mode_requirements

  if [ "$CADDY_MODE" = "none" ] && service_enabled omp-console-caddy; then
    run systemctl disable omp-console-caddy
  fi

  install_node
  install_omp

  build_control_plane
  build_web
  install_installer_scripts

  ensure_service_user

  if [ "$CADDY_MODE" != "none" ]; then
    install_caddy
    configure_caddy "$CADDY_MODE" "$WEB_HOST" "$WEB_ROOT" "127.0.0.1:${PORT}" "$EMAIL"
    install_caddy_unit
  fi

  write_backend_config "$MODE" "$PUBLIC_URL" "$BIND_HOST" "$INSECURE_HTTP" "$CONNECTION_MODE"

  if [ "$NO_PAIRING" != "1" ]; then
    mint_pairing_code
  fi

  render_control_unit
  start_control_plane

  if [ "$CADDY_MODE" != "none" ]; then
    start_caddy
  fi

  health_check_loopback || die "The control plane did not become healthy. Check: journalctl -u omp-console -n 50"
  health_check_public

  write_install_marker
  print_summary
}

parse_args "$@"

MARKER="${CONFIG_DIR:-/etc/omp-console}/install.env"
load_marker
CONFIG_DIR="${CONFIG_DIR:-/etc/omp-console}"
MARKER="${CONFIG_DIR}/install.env"
WEB_MODE="${WEB_MODE:-auto}"
SERVICE_USER_CREATED="${SERVICE_USER_CREATED:-0}"

# shellcheck disable=SC1091
. "${INSTALLER_DIR}/lib/control-plane.sh"

validate_paths
main "$@"