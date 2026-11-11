#!/usr/bin/env bash
# Shared helpers for the OMP Console installer.
# Sourced by install.sh, uninstall.sh, and doctor.sh. Never executed directly.

: "${DRY_RUN:=0}"
: "${ASSUME_YES:=0}"

if [ -t 2 ] && [ -z "${NO_COLOR:-}" ]; then
  C_RED=$'\033[31m'
  C_GREEN=$'\033[32m'
  C_YELLOW=$'\033[33m'
  C_BLUE=$'\033[34m'
  C_RESET=$'\033[0m'
else
  C_RED=""
  C_GREEN=""
  C_YELLOW=""
  C_BLUE=""
  C_RESET=""
fi

log_info() { printf '%s==>%s %s\n' "$C_BLUE" "$C_RESET" "$*" >&2; }
log_ok() { printf '%s ok %s %s\n' "$C_GREEN" "$C_RESET" "$*" >&2; }
log_warn() { printf '%swarn%s %s\n' "$C_YELLOW" "$C_RESET" "$*" >&2; }
log_error() { printf '%sfail%s %s\n' "$C_RED" "$C_RESET" "$*" >&2; }

die() {
  log_error "$*"
  exit 1
}

dry_run() {
  [ "$DRY_RUN" = "1" ]
}

run() {
  if dry_run; then
    printf 'dry-run: %s\n' "$*" >&2
    return 0
  fi
  "$@"
}

run_shell() {
  if dry_run; then
    printf 'dry-run: sh -c %s\n' "$1" >&2
    return 0
  fi
  sh -c "$1"
}

confirm() {
  local prompt="$1"
  local answer
  if [ "$ASSUME_YES" = "1" ]; then
    return 0
  fi
  if [ ! -t 0 ]; then
    die "$prompt Answer requires a terminal. Pass --yes to proceed non-interactively."
  fi
  printf '%s [y/N] ' "$prompt" >&2
  read -r answer
  case "$answer" in
    y | Y | yes | YES) return 0 ;;
    *) return 1 ;;
  esac
}

require_root() {
  if [ "$(id -u)" -ne 0 ]; then
    die "This installer must run as root. Try: sudo $0 $*"
  fi
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Required command '$1' is missing. $2"
}

download() {
  local url="$1"
  local dest="$2"
  curl -fL --retry 3 --retry-delay 2 --connect-timeout 15 --max-time 600 \
    -o "$dest" "$url"
}

atomic_write() {
  local dest="$1"
  local mode="$2"
  local tmp
  tmp="$(mktemp)"
  cat >"$tmp"
  if dry_run; then
    printf 'dry-run: write %s (mode %s)\n' "$dest" "$mode" >&2
    sed 's/^/    /' "$tmp" >&2
    rm -f "$tmp"
    return 0
  fi
  install -m "$mode" "$tmp" "$dest"
  rm -f "$tmp"
}

ensure_dir() {
  local dir="$1"
  local mode="${2:-0755}"
  local owner="${3:-root:root}"
  if dry_run; then
    printf 'dry-run: mkdir %s (mode %s, owner %s)\n' "$dir" "$mode" "$owner" >&2
    return 0
  fi
  mkdir -p "$dir"
  chmod "$mode" "$dir"
  chown "$owner" "$dir"
}

is_ipv4() {
  local ip="$1"
  case "$ip" in
    *[!0-9.]* | .* | *. | *..*) return 1 ;;
  esac
  local IFS=.
  # shellcheck disable=SC2206
  local parts=($ip)
  [ "${#parts[@]}" -eq 4 ] || return 1
  local part
  for part in "${parts[@]}"; do
    [ -n "$part" ] || return 1
    [ "$part" -ge 0 ] 2>/dev/null || return 1
    [ "$part" -le 255 ] || return 1
  done
  return 0
}

is_ipv6() {
  local ip="$1"
  case "$ip" in
    *:*) return 0 ;;
    *) return 1 ;;
  esac
}

json_escape() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

version_ge() {
  local have="${1#v}"
  local want="${2#v}"
  [ "$have" = "$want" ] && return 0
  local IFS=.
  # shellcheck disable=SC2206
  local have_parts=($have)
  # shellcheck disable=SC2206
  local want_parts=($want)
  local i
  local max=${#have_parts[@]}
  if [ "${#want_parts[@]}" -gt "$max" ]; then
    max=${#want_parts[@]}
  fi
  for ((i = 0; i < max; i++)); do
    local h="${have_parts[i]:-0}"
    local w="${want_parts[i]:-0}"
    h="${h%%[!0-9]*}"
    w="${w%%[!0-9]*}"
    h="${h:-0}"
    w="${w:-0}"
    if ((10#$h > 10#$w)); then return 0; fi
    if ((10#$h < 10#$w)); then return 1; fi
  done
  return 0
}

sha512_file() {
  sha512sum "$1" | awk '{print $1}'
}

sha256_file() {
  sha256sum "$1" | awk '{print $1}'
}

read_marker() {
  local marker="$1"
  local key="$2"
  [ -r "$marker" ] || return 1
  sed -n "s/^${key}=//p" "$marker" | head -1
}

write_marker() {
  local marker="$1"
  shift
  {
    printf '%s\n' "$@"
  } | atomic_write "$marker" 600
}

TMP_DIRS=()

make_temp_dir() {
  local dir
  dir="$(mktemp -d)"
  TMP_DIRS+=("$dir")
  printf '%s' "$dir"
}

cleanup_temp_dirs() {
  local dir
  for dir in "${TMP_DIRS[@]:-}"; do
    if [ -n "$dir" ]; then
      rm -rf "$dir"
    fi
  done
  return 0
}