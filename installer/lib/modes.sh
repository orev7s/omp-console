#!/usr/bin/env bash
# Connection mode selection and validation.

MODE=""
DOMAIN=""
EMAIL=""
PUBLIC_IP=""
PRIVATE_HOST=""
BIND_HOST="127.0.0.1"
CONNECTION_MODE="https_domain"
PUBLIC_URL=""
INSECURE_HTTP="false"
WEB_HOST=""
CADDY_MODE=""

prompt_value() {
  local var_name="$1"
  local prompt="$2"
  local default="${3:-}"
  local value=""
  if [ "$ASSUME_YES" = "1" ]; then
    return 1
  fi
  if [ ! -t 0 ]; then
    return 1
  fi
  if [ -n "$default" ]; then
    printf '%s [%s]: ' "$prompt" "$default" >&2
  else
    printf '%s: ' "$prompt" >&2
  fi
  read -r value
  [ -n "$value" ] || value="$default"
  [ -n "$value" ] || return 1
  printf -v "$var_name" '%s' "$value"
}

select_mode() {
  if [ -z "$MODE" ]; then
    if [ "$ASSUME_YES" = "1" ]; then
      die "Choose a connection mode with --mode domain|ip|private|http."
    fi
    printf '\nConnection mode:\n' >&2
    printf '  1) Domain with a trusted certificate (recommended)\n' >&2
    printf '  2) Bare IP with a Let'"'"'s Encrypt IP certificate\n' >&2
    printf '  3) Private network (Tailscale or WireGuard)\n' >&2
    printf '  4) Direct HTTP (unencrypted, explicit opt-in)\n' >&2
    local choice=""
    printf 'Choose 1-4 [1]: ' >&2
    read -r choice
    case "${choice:-1}" in
      1) MODE="domain" ;;
      2) MODE="ip" ;;
      3) MODE="private" ;;
      4) MODE="http" ;;
      *) die "Invalid choice. Rerun with --mode domain|ip|private|http." ;;
    esac
  fi

  case "$MODE" in
    domain | ip | private | http) ;;
    *) die "Invalid mode '${MODE}'. Use domain, ip, private, or http." ;;
  esac
}

validate_mode() {
  case "$MODE" in
    domain)
      [ -n "$DOMAIN" ] || prompt_value DOMAIN "Domain name (for example console.example.com)" || die "Domain mode needs --domain."
      [ -n "$EMAIL" ] || prompt_value EMAIL "ACME account email (optional, press Enter to skip)" || EMAIL=""
      [ -n "$PUBLIC_IP" ] || PUBLIC_IP="$(public_ip || true)"
      [ -n "$PUBLIC_IP" ] || die "Could not detect the public IP. Pass --public-ip."
      if ! host_matches_ip "$DOMAIN" "$PUBLIC_IP"; then
        log_warn "${DOMAIN} does not resolve to ${PUBLIC_IP} yet. Caddy cannot get a certificate until the DNS record points here."
      fi
      check_port_free 80 "HTTP-01 challenge"
      check_port_free 443 "HTTPS"
      BIND_HOST="127.0.0.1"
      CONNECTION_MODE="https_domain"
      PUBLIC_URL="https://${DOMAIN}"
      WEB_HOST="$DOMAIN"
      CADDY_MODE="domain"
      ;;
    ip)
      [ -n "$PUBLIC_IP" ] || PUBLIC_IP="$(public_ip || true)"
      [ -n "$PUBLIC_IP" ] || die "IP mode needs --public-ip (or a detectable public IP)."
      is_ipv4 "$PUBLIC_IP" || die "IP mode supports IPv4 only for now. Got '${PUBLIC_IP}'."
      check_port_free 80 "HTTP-01 challenge"
      check_port_free 443 "HTTPS"
      BIND_HOST="127.0.0.1"
      CONNECTION_MODE="https_ip"
      PUBLIC_URL="https://${PUBLIC_IP}"
      WEB_HOST="$PUBLIC_IP"
      CADDY_MODE="ip"
      ;;
    private)
      [ -n "$PRIVATE_HOST" ] || prompt_value PRIVATE_HOST "Private hostname (for example machine.tailnet.ts.net)" || die "Private mode needs --private-host."
      if ! printf '%s' "$PRIVATE_HOST" | grep -q '\.'; then
        die "The private host '${PRIVATE_HOST}' does not look like a hostname. Use the Tailscale DNS name or a WireGuard name."
      fi
      check_port_free 80 "Caddy private front"
      check_port_free 443 "Caddy private front"
      BIND_HOST="127.0.0.1"
      CONNECTION_MODE="https_private"
      PUBLIC_URL="https://${PRIVATE_HOST}"
      WEB_HOST="$PRIVATE_HOST"
      CADDY_MODE="private"
      ;;
    http)
      if [ -z "$PUBLIC_IP" ]; then
        PUBLIC_IP="$(public_ip || true)"
      fi
      [ -n "$PUBLIC_IP" ] || die "HTTP mode needs --public-ip (or a detectable public IP)."
      if [ "$ASSUME_YES" != "1" ]; then
        log_warn "Direct HTTP sends the pairing code, device token, and all traffic unencrypted."
        confirm "Serve plain HTTP on ${PUBLIC_IP}:${PORT}?" || die "Aborted. Choose domain, ip, or private for TLS."
      fi
      check_port_free "$PORT" "control plane"
      BIND_HOST="0.0.0.0"
      CONNECTION_MODE="http"
      PUBLIC_URL="http://${PUBLIC_IP}:${PORT}"
      WEB_HOST="${PUBLIC_IP}:${PORT}"
      INSECURE_HTTP="true"
      CADDY_MODE="none"
      ;;
  esac
}

print_mode_requirements() {
  case "$MODE" in
    domain)
      log_info "Domain mode: ${DOMAIN} must resolve to ${PUBLIC_IP}, and ports 80 and 443 must be reachable."
      ;;
    ip)
      log_info "IP mode: ${PUBLIC_IP} must be the host's public IPv4 address, and port 80 must be reachable."
      log_info "The certificate is short-lived (about six days) and Caddy renews it automatically."
      ;;
    private)
      log_info "Private mode: ${PRIVATE_HOST} must resolve inside your private network."
      log_info "Ensure HTTPS is enabled for the tailnet, or terminate TLS on the private network."
      if command -v tailscale >/dev/null 2>&1; then
        if ! tailscale status >/dev/null 2>&1; then
          log_warn "Tailscale is installed but not running. Start it before expecting a certificate."
        fi
      else
        log_warn "tailscale is not installed. Use WireGuard or terminate TLS on the private network yourself."
      fi
      ;;
    http)
      log_warn "HTTP mode: traffic and credentials are unencrypted. Use only on a trusted network."
      ;;
  esac
  local fw
  fw="$(firewall_status || true)"
  if [ "$fw" != "unknown" ]; then
    log_warn "A local firewall (${fw}) is active. Open the required ports if they are not already allowed."
  fi
  if [ "$MODE" = "domain" ] || [ "$MODE" = "ip" ]; then
    log_info "The cloud provider's security group must also allow TCP 80 and 443."
  fi
}