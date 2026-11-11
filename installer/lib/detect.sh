#!/usr/bin/env bash
# Platform, architecture, network, and port detection.

normalize_arch() {
  case "$1" in
    x86_64 | amd64) printf 'amd64' ;;
    aarch64 | arm64) printf 'arm64' ;;
    *) printf '%s' "$1" ;;
  esac
}

detect_libc() {
  if command -v getconf >/dev/null 2>&1 && getconf GNU_LIBC_VERSION >/dev/null 2>&1; then
    printf 'glibc'
    return
  fi
  if command -v ldd >/dev/null 2>&1 && ldd --version 2>&1 | grep -qi musl; then
    printf 'musl'
    return
  fi
  if [ -f /etc/alpine-release ]; then
    printf 'musl'
    return
  fi
  printf 'unknown'
}

detect_pkg_manager() {
  local pm
  for pm in apt-get dnf yum apk pacman zypper; do
    if command -v "$pm" >/dev/null 2>&1; then
      printf '%s' "$pm"
      return
    fi
  done
  printf 'unknown'
}

detect_platform() {
  OS_ID="unknown"
  OS_LIKE=""
  OS_VERSION="unknown"
  if [ -r /etc/os-release ]; then
    # shellcheck disable=SC1091
    . /etc/os-release
    OS_ID="${ID:-unknown}"
    OS_LIKE="${ID_LIKE:-}"
    OS_VERSION="${VERSION_ID:-unknown}"
  fi
  ARCH="$(normalize_arch "$(uname -m)")"
  LIBC="$(detect_libc)"
  PKG_MANAGER="$(detect_pkg_manager)"
  if [ -d /run/systemd/system ]; then
    INIT_SYSTEM="systemd"
  else
    INIT_SYSTEM="other"
  fi
}

require_supported_platform() {
  case "$ARCH" in
    amd64 | arm64) ;;
    *) die "Unsupported architecture '$ARCH'. Only amd64 (x86_64) and arm64 (aarch64) are supported." ;;
  esac
  [ "$INIT_SYSTEM" = "systemd" ] || die "systemd is required. This host does not run systemd as PID 1."
}

public_ip() {
  local ip=""
  local url
  for url in https://api.ipify.org https://ifconfig.me/ip https://icanhazip.com; do
    ip="$(curl -fsS --max-time 10 "$url" 2>/dev/null | tr -d '[:space:]' || true)"
    if is_ipv4 "$ip" || is_ipv6 "$ip"; then
      printf '%s' "$ip"
      return 0
    fi
  done
  ip="$(ip -4 route get 1.1.1.1 2>/dev/null | sed -n 's/.* src \([0-9.]*\).*/\1/p' | head -1 || true)"
  if [ -n "$ip" ]; then
    printf '%s' "$ip"
    return 0
  fi
  return 1
}

resolve_host() {
  getent ahosts "$1" 2>/dev/null | awk '{print $1}' | sort -u
}

host_matches_ip() {
  local host="$1"
  local ip="$2"
  resolve_host "$host" | grep -qx "$ip"
}

port_in_use() {
  local port="$1"
  if command -v ss >/dev/null 2>&1; then
    if ss -ltnH "sport = :$port" 2>/dev/null | grep -q .; then
      return 0
    fi
    return 1
  fi
  if command -v netstat >/dev/null 2>&1; then
    netstat -ltn 2>/dev/null | awk '{print $4}' | grep -qE "[:.]$port$"
    return $?
  fi
  return 1
}

check_port_free() {
  local port="$1"
  local label="$2"
  if port_in_use "$port"; then
    die "Port $port ($label) is already in use. Stop the process using it, then rerun the installer."
  fi
}

firewall_status() {
  if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q "Status: active"; then
    printf 'ufw'
    return
  fi
  if command -v firewall-cmd >/dev/null 2>&1 && firewall-cmd --state 2>/dev/null | grep -q running; then
    printf 'firewalld'
    return
  fi
  printf 'unknown'
}

service_active() {
  systemctl is-active --quiet "$1" 2>/dev/null
}

service_enabled() {
  systemctl is-enabled --quiet "$1" 2>/dev/null
}