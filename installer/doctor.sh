#!/usr/bin/env bash
# OMP Console diagnostics.
#
# Checks the install without changing anything. Exits nonzero if a hard check
# fails. Warnings do not fail the run.

set -Eeuo pipefail

SCRIPT_PATH="${BASH_SOURCE[0]}"
INSTALLER_DIR="$(cd "$(dirname "${SCRIPT_PATH}")" && pwd)"

# shellcheck disable=SC1091
. "${INSTALLER_DIR}/lib/common.sh"
# shellcheck disable=SC1091
. "${INSTALLER_DIR}/lib/detect.sh"

PASS=0
WARN=0
FAIL=0

ok() {
  log_ok "$1"
  PASS=$((PASS + 1))
}

warn() {
  log_warn "$1"
  WARN=$((WARN + 1))
}

fail() {
  log_error "$1"
  FAIL=$((FAIL + 1))
}

usage() {
  cat >&2 <<'EOF'
Usage: ./installer/doctor.sh [--config-dir DIR]

Checks the platform, Node, omp, services, health, TLS, DNS, ports, and file
permissions. It does not need root for most checks.
EOF
}

CONFIG_DIR=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --config-dir)
      [ "$#" -ge 2 ] || die "--config-dir needs a value."
      CONFIG_DIR="$2"
      shift 2
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

MARKER="${CONFIG_DIR:-/etc/omp-console}/install.env"

PREFIX=""
DATA_DIR=""
SERVICE_USER=""
PORT=""
MODE=""
DOMAIN=""
PUBLIC_IP=""
PRIVATE_HOST=""
PUBLIC_URL=""
WEB_HOST=""

if [ -r "$MARKER" ]; then
  PREFIX="$(read_marker "$MARKER" PREFIX || true)"
  DATA_DIR="$(read_marker "$MARKER" DATA_DIR || true)"
  CONFIG_DIR="$(read_marker "$MARKER" CONFIG_DIR || true)"
  SERVICE_USER="$(read_marker "$MARKER" SERVICE_USER || true)"
  PORT="$(read_marker "$MARKER" PORT || true)"
  MODE="$(read_marker "$MARKER" MODE || true)"
  DOMAIN="$(read_marker "$MARKER" DOMAIN || true)"
  PUBLIC_IP="$(read_marker "$MARKER" PUBLIC_IP || true)"
  PRIVATE_HOST="$(read_marker "$MARKER" PRIVATE_HOST || true)"
  PUBLIC_URL="$(read_marker "$MARKER" PUBLIC_URL || true)"
else
  warn "No install marker at ${MARKER}. Using default paths."
fi

PREFIX="${PREFIX:-/opt/omp-console}"
DATA_DIR="${DATA_DIR:-/var/lib/omp-console}"
CONFIG_DIR="${CONFIG_DIR:-/etc/omp-console}"
SERVICE_USER="${SERVICE_USER:-omp-console}"
PORT="${PORT:-8722}"
MODE="${MODE:-unknown}"

case "$MODE" in
  domain) WEB_HOST="$DOMAIN" ;;
  ip) WEB_HOST="$PUBLIC_IP" ;;
  private) WEB_HOST="$PRIVATE_HOST" ;;
  http) WEB_HOST="${PUBLIC_IP}:${PORT}" ;;
  *) WEB_HOST="" ;;
esac
if [ -z "$PUBLIC_URL" ]; then
  case "$MODE" in
    domain) PUBLIC_URL="https://${DOMAIN}" ;;
    ip) PUBLIC_URL="https://${PUBLIC_IP}" ;;
    private) PUBLIC_URL="https://${PRIVATE_HOST}" ;;
    http) PUBLIC_URL="http://${PUBLIC_IP}:${PORT}" ;;
    *) PUBLIC_URL="" ;;
  esac
fi

log_info "OMP Console diagnostics"
log_info "Mode: ${MODE}; prefix: ${PREFIX}; data: ${DATA_DIR}"

detect_platform
case "$ARCH" in
  amd64 | arm64) ok "Architecture: ${ARCH} (${LIBC})" ;;
  *) fail "Unsupported architecture: ${ARCH}" ;;
esac
if [ "$INIT_SYSTEM" = "systemd" ]; then
  ok "Init system: systemd"
else
  fail "systemd is not running as PID 1. The service units cannot work."
fi

if command -v node >/dev/null 2>&1; then
  NODE_VERSION="$(node -v)"
  NODE_MAJOR="$(printf '%s' "$NODE_VERSION" | sed 's/^v//' | cut -d. -f1)"
  if [ "$NODE_MAJOR" = "24" ] || [ "$NODE_MAJOR" = "26" ]; then
    ok "Node ${NODE_VERSION}"
  else
    warn "Node ${NODE_VERSION} is not 24 or 26. The project targets 24 or 26."
  fi
else
  fail "node is not on PATH."
fi

if command -v npm >/dev/null 2>&1; then
  ok "npm $(npm -v)"
else
  warn "npm is not on PATH. The installer needs it to build."
fi

if command -v omp >/dev/null 2>&1; then
  ok "omp: $(omp --version 2>/dev/null | head -1)"
else
  warn "omp is not installed. The control plane does not need it in Phase 2; the agent host will."
fi

if [ -f /etc/systemd/system/omp-console.service ]; then
  ok "Control plane unit installed."
else
  fail "Control plane unit /etc/systemd/system/omp-console.service is missing."
fi

if service_active omp-console; then
  ok "omp-console service is active."
else
  fail "omp-console service is not active. Check: journalctl -u omp-console -n 50"
fi

if service_enabled omp-console; then
  ok "omp-console service is enabled."
else
  warn "omp-console service is not enabled at boot."
fi

if curl -fsS --max-time 5 -o /dev/null "http://127.0.0.1:${PORT}/v1/health" 2>/dev/null; then
  ok "Loopback health: http://127.0.0.1:${PORT}/v1/health"
else
  fail "Loopback health failed. Check: journalctl -u omp-console -n 50"
fi

if [ "$MODE" != "http" ] && [ "$MODE" != "unknown" ]; then
  if [ -f /etc/systemd/system/omp-console-caddy.service ]; then
    ok "Caddy unit installed."
  else
    fail "Caddy unit /etc/systemd/system/omp-console-caddy.service is missing."
  fi
  if service_active omp-console-caddy; then
    ok "omp-console-caddy service is active."
  else
    fail "omp-console-caddy service is not active. Check: journalctl -u omp-console-caddy -n 50"
  fi
  if port_in_use 80; then
    ok "Port 80 is listening."
  else
    warn "Port 80 is not listening. HTTP-01 certificate validation needs it."
  fi
  if port_in_use 443; then
    ok "Port 443 is listening."
  else
    warn "Port 443 is not listening."
  fi
fi

if [ -n "$PUBLIC_URL" ]; then
  if curl -fsS --max-time 10 -o /dev/null "${PUBLIC_URL}/v1/health" 2>/dev/null; then
    ok "Public health: ${PUBLIC_URL}/v1/health"
  else
    warn "Public health failed for ${PUBLIC_URL}. DNS, ports 80/443, or hairpin NAT may be the cause."
  fi
fi

if [ "$MODE" = "domain" ] && [ -n "$DOMAIN" ] && [ -n "$PUBLIC_IP" ]; then
  if host_matches_ip "$DOMAIN" "$PUBLIC_IP"; then
    ok "DNS: ${DOMAIN} resolves to ${PUBLIC_IP}."
  else
    warn "DNS: ${DOMAIN} does not resolve to ${PUBLIC_IP}. Caddy cannot get a certificate until it does."
  fi
fi

if [ "$MODE" = "private" ]; then
  if command -v tailscale >/dev/null 2>&1 && tailscale status >/dev/null 2>&1; then
    ok "Tailscale is running."
  else
    warn "Tailscale is not running (or not installed). Private mode needs the private network up."
  fi
fi

if [ -d "$DATA_DIR" ]; then
  PERMS="$(stat -c '%a %U:%G' "$DATA_DIR" 2>/dev/null || true)"
  case "$PERMS" in
    "700 ${SERVICE_USER}:"*) ok "Data directory ${DATA_DIR} is ${PERMS}." ;;
    *) warn "Data directory ${DATA_DIR} is ${PERMS:-unknown}. Expected 700 ${SERVICE_USER}." ;;
  esac
else
  fail "Data directory ${DATA_DIR} is missing."
fi

if [ -f "${DATA_DIR}/config.json" ]; then
  PERMS="$(stat -c '%a %U:%G' "${DATA_DIR}/config.json" 2>/dev/null || true)"
  case "$PERMS" in
    "600 ${SERVICE_USER}:"*) ok "Config file is ${PERMS}." ;;
    *) warn "Config file is ${PERMS:-unknown}. Expected 600 ${SERVICE_USER}." ;;
  esac
else
  fail "Config file ${DATA_DIR}/config.json is missing."
fi

if [ -d "$DATA_DIR" ]; then
  USED="$(df -P "$DATA_DIR" 2>/dev/null | awk 'NR==2 {gsub("%", "", $5); print $5}')"
  if [ -n "$USED" ] && [ "$USED" -ge 85 ] 2>/dev/null; then
    warn "Disk usage for ${DATA_DIR} is ${USED}%."
  else
    ok "Disk usage for ${DATA_DIR}: ${USED:-unknown}%."
  fi
fi

if command -v journalctl >/dev/null 2>&1; then
  ERRORS="$(journalctl -u omp-console -n 50 --no-pager 2>/dev/null | grep -ciE 'error|fatal' || true)"
  if [ "${ERRORS:-0}" -gt 0 ]; then
    warn "journalctl for omp-console has ${ERRORS} error-like lines in the last 50. Review: journalctl -u omp-console -n 50"
  else
    ok "No error-like lines for omp-console in the last 50 journal lines."
  fi
fi

printf '\n%d ok, %d warning(s), %d failure(s).\n' "$PASS" "$WARN" "$FAIL" >&2
if [ "$FAIL" -gt 0 ]; then
  exit 1
fi