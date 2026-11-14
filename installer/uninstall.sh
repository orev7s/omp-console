#!/usr/bin/env bash
# OMP Console uninstaller.
#
# Stops and removes the control plane and Caddy units, removes the installed
# files, and removes the data directory unless --keep-data is given. It never
# removes a Caddy or Node installation that may be shared with other software.

set -Eeuo pipefail

SCRIPT_PATH="${BASH_SOURCE[0]}"
INSTALLER_DIR="$(cd "$(dirname "${SCRIPT_PATH}")" && pwd)"

# shellcheck disable=SC1091
. "${INSTALLER_DIR}/lib/common.sh"
# shellcheck disable=SC1091
. "${INSTALLER_DIR}/lib/detect.sh"

trap cleanup_temp_dirs EXIT

PREFIX=""
DATA_DIR=""
CONFIG_DIR=""
SERVICE_USER=""
SERVICE_USER_CREATED=""
KEEP_DATA=0
PURGE=0

usage() {
  cat >&2 <<'EOF'
Usage: sudo ./installer/uninstall.sh [options]

Options:
  --keep-data        Keep the data directory, paired devices, and server id.
  --purge            Also remove the Caddy data directory (certificates).
  --prefix DIR       Install directory. Default: from the install marker, else /opt/omp-console.
  --data-dir DIR     Data directory. Default: from the install marker, else /var/lib/omp-console.
  --config-dir DIR   Marker directory. Default: /etc/omp-console.
  --user NAME        Service user. Default: from the install marker, else omp-console.
  --yes, -y          Do not ask for confirmation.
  --dry-run          Print actions without changing the system.
  --help, -h         Show this help.
EOF
}

need_value() {
  [ "$#" -ge 2 ] || die "Option $1 needs a value."
}

parse_args() {
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --keep-data)
        KEEP_DATA=1
        shift
        ;;
      --purge)
        PURGE=1
        shift
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
      --user)
        need_value "$@"
        SERVICE_USER="$2"
        shift 2
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
  PREFIX="${PREFIX:-$(read_marker "$MARKER" PREFIX || true)}"
  DATA_DIR="${DATA_DIR:-$(read_marker "$MARKER" DATA_DIR || true)}"
  CONFIG_DIR="${CONFIG_DIR:-$(read_marker "$MARKER" CONFIG_DIR || true)}"
  SERVICE_USER="${SERVICE_USER:-$(read_marker "$MARKER" SERVICE_USER || true)}"
  SERVICE_USER_CREATED="${SERVICE_USER_CREATED:-$(read_marker "$MARKER" SERVICE_USER_CREATED || true)}"
}

safe_rm_rf() {
  local dir="$1"
  case "$dir" in
    "" | "/" | "/usr" | "/etc" | "/var" | "/opt" | "/home" | "/root")
      die "Refusing to remove unsafe path '${dir}'."
      ;;
  esac
  case "$dir" in
    /*) ;;
    *) die "Refusing to remove a relative path '${dir}'." ;;
  esac
  run rm -rf "$dir"
}

stop_services() {
  local svc
  for svc in omp-console omp-console-agent-host omp-console-caddy; do
    if service_active "$svc"; then
      run systemctl stop "$svc"
    fi
    if service_enabled "$svc"; then
      run systemctl disable "$svc"
    fi
  done
}

remove_units() {
  local unit
  for unit in /etc/systemd/system/omp-console.service /etc/systemd/system/omp-console-agent-host.service /etc/systemd/system/omp-console-caddy.service; do
    if [ -e "$unit" ]; then
      run rm -f "$unit"
    fi
  done
  run systemctl daemon-reload
  run systemctl reset-failed omp-console omp-console-agent-host omp-console-caddy 2>/dev/null || true
}

remove_service_user() {
  id -u "$SERVICE_USER" >/dev/null 2>&1 || return 0
  if [ "$KEEP_DATA" = "1" ]; then
    log_info "Keeping the service user ${SERVICE_USER} because --keep-data was used."
    return 0
  fi
  if [ "$SERVICE_USER_CREATED" != "1" ]; then
    log_info "Leaving the service user ${SERVICE_USER} because it was not created by this installer."
    return 0
  fi
  if command -v userdel >/dev/null 2>&1; then
    run userdel "$SERVICE_USER"
  elif command -v deluser >/dev/null 2>&1; then
    run deluser "$SERVICE_USER"
  else
    log_warn "Could not remove the service user ${SERVICE_USER}. Remove it manually."
  fi
}

main() {
  parse_args_before_marker "$@"

  if ! dry_run; then
    require_root "$@"
  fi

  MARKER="${CONFIG_DIR:-/etc/omp-console}/install.env"
  load_marker
  PREFIX="${PREFIX:-/opt/omp-console}"
  DATA_DIR="${DATA_DIR:-/var/lib/omp-console}"
  CONFIG_DIR="${CONFIG_DIR:-/etc/omp-console}"
  SERVICE_USER="${SERVICE_USER:-omp-console}"
  SERVICE_USER_CREATED="${SERVICE_USER_CREATED:-0}"
  MARKER="${CONFIG_DIR}/install.env"

  if [ ! -r "$MARKER" ]; then
    log_warn "No install marker at ${MARKER}. Using default paths and leaving the service user in place."
  fi

  if [ "$ASSUME_YES" != "1" ]; then
    confirm "Remove OMP Console from this host? Data is $([ "$KEEP_DATA" = "1" ] && echo kept || echo removed)." ||
      die "Aborted."
  fi

  log_info "Stopping services."
  stop_services

  log_info "Removing systemd units."
  remove_units

  log_info "Removing installed files under ${PREFIX}."
  safe_rm_rf "$PREFIX"

  log_info "Removing the Caddy configuration."
  safe_rm_rf "/etc/caddy/omp-console"

  if [ "$PURGE" = "1" ]; then
    log_warn "Removing the Caddy data directory, including certificates."
    safe_rm_rf "/var/lib/caddy"
  fi

  if [ "$KEEP_DATA" = "1" ]; then
    log_info "Keeping the data directory ${DATA_DIR}."
  else
    log_info "Removing the data directory ${DATA_DIR}."
    safe_rm_rf "$DATA_DIR"
  fi

  remove_service_user

  log_info "Removing the install marker."
  if [ -e "$MARKER" ]; then
    run rm -f "$MARKER"
  fi
  if [ -d "$CONFIG_DIR" ] && ! dry_run; then
    rmdir "$CONFIG_DIR" 2>/dev/null || true
  fi

  log_ok "OMP Console removed."
  log_info "Node, omp, and the Caddy binary were left in place because other software may use them."
}

# Parse args before the marker is loaded so explicit flags win. main() calls
# parse_args_before_marker, then loads the marker for anything still unset.
parse_args_before_marker() {
  parse_args "$@"
}

main "$@"