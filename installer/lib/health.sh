#!/usr/bin/env bash
# Health checks and the final summary.

wait_for_url() {
  local url="$1"
  local attempts="${2:-30}"
  local i
  for ((i = 1; i <= attempts; i++)); do
    if curl -fsS --max-time 5 -o /dev/null "$url" 2>/dev/null; then
      return 0
    fi
    sleep 1
  done
  return 1
}

health_check_loopback() {
  if dry_run; then
    log_info "Dry run: would check http://127.0.0.1:${PORT}/v1/health."
    return 0
  fi
  log_info "Checking the control plane on loopback."
  if wait_for_url "http://127.0.0.1:${PORT}/v1/health" 30; then
    log_ok "Control plane is healthy on 127.0.0.1:${PORT}."
    return 0
  fi
  log_error "The control plane did not answer on 127.0.0.1:${PORT}."
  systemctl --no-pager --full status omp-console 2>&1 | tail -n 20 >&2 || true
  return 1
}

health_check_public() {
  if dry_run; then
    log_info "Dry run: would check the public health endpoint."
    return 0
  fi
  if [ "$CADDY_MODE" = "none" ]; then
    if wait_for_url "http://${PUBLIC_IP}:${PORT}/v1/health" 30; then
      log_ok "Public HTTP health check passed."
    else
      log_warn "Could not reach http://${PUBLIC_IP}:${PORT}/v1/health from this host."
      log_warn "Check the firewall and the cloud security group. Test from another device too."
    fi
    return 0
  fi

  log_info "Checking https://${WEB_HOST}/v1/health. Certificate issuance can take up to a minute."
  if wait_for_url "https://${WEB_HOST}/v1/health" 120; then
    log_ok "Public HTTPS health check passed with a trusted certificate."
    return 0
  fi
  log_warn "The public HTTPS check did not pass yet for https://${WEB_HOST}."
  log_warn "Common causes: DNS does not point here yet, ports 80/443 are closed, or the"
  log_warn "network cannot reach its own public address from inside. Test from another device."
  log_warn "Caddy logs: journalctl -u omp-console-caddy -n 50"
  return 0
}

print_summary() {
  local scripts_dir="$INSTALLER_DIR"
  if [ -d "${PREFIX}/installer" ]; then
    scripts_dir="${PREFIX}/installer"
  fi
  {
    printf '\n'
    printf 'OMP Console is installed.\n'
    printf '\n'
    printf '  URL:            %s\n' "${PUBLIC_URL}"
    printf '  Listen:         %s (loopback)\n' "${PREFIX}"
    printf '  Data:           %s\n' "${DATA_DIR}"
    printf '  Service:        omp-console\n'
    if [ "$CADDY_MODE" != "none" ]; then
      printf '  TLS:            omp-console-caddy\n'
    fi
    printf '\n'
    if [ -n "${PAIRING_CODE:-}" ]; then
      printf '  Pairing code:   %s\n' "${PAIRING_CODE}"

      local authority="${PUBLIC_URL#https://}"
      authority="${authority#http://}"
      authority="${authority%%/*}"
      local pair_host="${authority%%:*}"
      local pair_port=""
      if [ "${authority}" != "${pair_host}" ]; then
        pair_port="${authority##*:}"
      fi
      local pair_mode="https_domain"
      case "${CADDY_MODE}" in
        ip) pair_mode="https_ip" ;;
        private) pair_mode="https_private" ;;
        none) pair_mode="http" ;;
      esac
      if [ -z "${pair_port}" ] && [ "${pair_mode}" != "http" ]; then
        pair_port="443"
      fi
      local deep_link="ompconsole://pair?host=${pair_host}&code=${PAIRING_CODE}&mode=${pair_mode}"
      if [ -n "${pair_port}" ]; then
        deep_link="${deep_link}&port=${pair_port}"
      fi
      printf '  Pair link:      %s\n' "${deep_link}"
      printf '\n'
      printf '  Scan this with the OMP Console app if it is installed:\n'
      if command -v qrencode >/dev/null 2>&1; then
        qrencode -t ANSIUTF8 "${deep_link}" || true
      else
        printf '  (install qrencode on the server to also print a scannable code)\n'
      fi
      printf '\n'
      printf '  This code is shown once. Enter it in the app or the browser build.\n'
      printf '  It is single use. Mint another with:\n'
      printf '    sudo -u %s env OMP_CONSOLE_DATA_DIR=%s OMP_CONSOLE_CONFIG=%s \\\n' "$SERVICE_USER" "$DATA_DIR" "$CONFIG_FILE"
      printf '      %s %s/apps/backend/dist/src/cli.js pair\n' "$NODE_BIN" "$PREFIX"
      printf '    sudo systemctl restart omp-console\n'
    else
      printf '  Pairing code: not minted automatically. Mint one with:\n'
      printf '    sudo -u %s env OMP_CONSOLE_DATA_DIR=%s OMP_CONSOLE_CONFIG=%s \\\n' "$SERVICE_USER" "$DATA_DIR" "$CONFIG_FILE"
      printf '      %s %s/apps/backend/dist/src/cli.js pair\n' "$NODE_BIN" "$PREFIX"
      printf '    sudo systemctl restart omp-console\n'
    fi
    printf '\n'
    printf '  Status:   systemctl status omp-console\n'
    printf '  Logs:     journalctl -u omp-console -f\n'
    printf '  Diagnose: sudo %s/doctor.sh\n' "$scripts_dir"
    printf '  Remove:   sudo %s/uninstall.sh\n' "$scripts_dir"
    printf '\n'
    if [ "$INSECURE_HTTP" = "true" ]; then
      printf '  WARNING: this install serves plain HTTP. Credentials and traffic are\n'
      printf '  unencrypted. Switch to a TLS mode when you can.\n'
    fi
  } >&2
}