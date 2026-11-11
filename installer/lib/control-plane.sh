#!/usr/bin/env bash
# Control plane build, configuration, systemd unit, and pairing material.

: "${PREFIX:=/opt/omp-console}"
: "${DATA_DIR:=/var/lib/omp-console}"
: "${CONFIG_DIR:=/etc/omp-console}"
: "${CONFIG_FILE:=${DATA_DIR}/config.json}"
: "${SERVICE_USER:=omp-console}"
: "${SERVICE_GROUP:=omp-console}"
: "${PORT:=8722}"

run_as() {
  local user="$1"
  shift
  if [ "$(id -u)" -eq 0 ]; then
    if command -v runuser >/dev/null 2>&1; then
      runuser -u "$user" -- "$@"
    elif command -v sudo >/dev/null 2>&1; then
      sudo -u "$user" -- "$@"
    else
      su -s /bin/sh "$user" -c "$(printf '%q ' "$@")"
    fi
  else
    "$@"
  fi
}

ensure_service_user() {
  if id -u "$SERVICE_USER" >/dev/null 2>&1; then
    return
  fi
  if command -v useradd >/dev/null 2>&1; then
    run useradd --system --home "$DATA_DIR" --shell /usr/sbin/nologin --user-group "$SERVICE_USER"
  elif command -v adduser >/dev/null 2>&1; then
    run adduser -S -H -h "$DATA_DIR" -s /sbin/nologin "$SERVICE_USER"
  else
    die "Could not create the service user ${SERVICE_USER}. Create it manually and rerun."
  fi
  SERVICE_USER_CREATED=1
}

build_control_plane() {
  if dry_run; then
    log_info "Dry run: would build the control plane and install it under ${PREFIX}."
    return
  fi
  local build_stage
  local runtime_stage
  build_stage="$(make_temp_dir)"
  runtime_stage="$(make_temp_dir)"

  log_info "Building the control plane from ${SOURCE_DIR}."
  run mkdir -p "$build_stage/apps/backend" "$build_stage/packages"
  run cp -a "$SOURCE_DIR/package.json" "$SOURCE_DIR/package-lock.json" "$SOURCE_DIR/tsconfig.base.json" "$build_stage/"
  (
    cd "$SOURCE_DIR/packages"
    tar -cf - --exclude=node_modules --exclude=dist . | (cd "$build_stage/packages" && tar -xf -)
  ) || {
    run cp -a "$SOURCE_DIR/packages/." "$build_stage/packages/"
  }
  (
    cd "$SOURCE_DIR/apps/backend"
    tar -cf - --exclude=node_modules --exclude=dist . | (cd "$build_stage/apps/backend" && tar -xf -)
  ) || {
    run cp -a "$SOURCE_DIR/apps/backend/." "$build_stage/apps/backend/"
  }

  (
    cd "$build_stage"
    npm ci --no-audit --no-fund
    npm run build:protocol
    npm run build:backend
  ) || {
    rm -rf "$build_stage" "$runtime_stage"
    die "The control plane build failed. Check the npm output above."
  }

  run cp -a "$build_stage/package.json" "$build_stage/package-lock.json" "$build_stage/tsconfig.base.json" "$runtime_stage/"
  run cp -a "$build_stage/packages" "$runtime_stage/"
  run mkdir -p "$runtime_stage/apps"
  run cp -a "$build_stage/apps/backend" "$runtime_stage/apps/"

  (
    cd "$runtime_stage"
    npm ci --omit=dev --no-audit --no-fund
  ) || {
    rm -rf "$build_stage" "$runtime_stage"
    die "Installing production dependencies failed."
  }

  log_info "Installing files under ${PREFIX}."
  if ! dry_run; then
    rm -rf "${PREFIX}/apps" "${PREFIX}/packages" "${PREFIX}/node_modules"
    mkdir -p "$PREFIX"
    cp -a "$runtime_stage/apps" "$PREFIX/"
    cp -a "$runtime_stage/packages" "$PREFIX/"
    cp -a "$runtime_stage/node_modules" "$PREFIX/"
    cp -a "$runtime_stage/package.json" "$PREFIX/"
    cp -a "$runtime_stage/package-lock.json" "$PREFIX/"
    chown -R root:root "$PREFIX"
    chmod -R go-w "$PREFIX"
  fi

  rm -rf "$build_stage" "$runtime_stage"
  log_ok "Control plane files installed."
}

build_web() {
  local app_dir="$SOURCE_DIR/apps/android"
  local dist="$app_dir/web/dist"
  WEB_ROOT="${PREFIX}/web"

  case "$WEB_MODE" in
    no)
      log_info "Skipping the browser UI (--with-web no)."
      return
      ;;
    auto)
      if [ -f "$dist/index.html" ]; then
        log_info "Using the existing browser build."
      elif [ ! -d "$app_dir/node_modules" ]; then
        log_warn "Browser UI not built and ${app_dir}/node_modules is missing. Skipping."
        log_warn "The phone app still works. To serve the browser UI later: cd apps/android && npm ci && npm run build:web, then rerun the installer with --with-web yes."
        return
      fi
      ;;
    yes) ;;
    *)
      die "Invalid --with-web value '${WEB_MODE}'. Use auto, yes, or no."
      ;;
  esac

  if dry_run; then
    log_info "Dry run: would install the browser UI at ${WEB_ROOT}."
    return
  fi

  if [ ! -f "$dist/index.html" ]; then
    if [ ! -f "$SOURCE_DIR/packages/protocol/dist/index.js" ]; then
      log_info "Building the shared protocol package for the browser build."
      (cd "$SOURCE_DIR" && npm run build:protocol) || die "Protocol build failed. Run npm run build:protocol and retry."
    fi
    if [ ! -d "$app_dir/node_modules" ]; then
      log_info "Installing browser build dependencies (this downloads the React Native web toolchain)."
      (cd "$app_dir" && npm ci --no-audit --no-fund) || die "Installing app dependencies failed."
    fi
    log_info "Building the browser UI."
    (cd "$app_dir" && npm run build:web) || die "The browser UI build failed. Run it manually in apps/android and retry."
  fi

  [ -f "$dist/index.html" ] || die "The browser build did not produce web/dist/index.html."
  if ! dry_run; then
    rm -rf "$WEB_ROOT"
    mkdir -p "$WEB_ROOT"
    cp -a "$dist/." "$WEB_ROOT/"
    chown -R root:root "$WEB_ROOT"
    chmod -R go-w "$WEB_ROOT"
  fi
  log_ok "Browser UI installed at ${WEB_ROOT}."
}

write_backend_config() {
  local mode="$1"
  local public_url="$2"
  local bind_host="$3"
  local insecure="$4"
  local connection_mode="$5"

  ensure_dir "$DATA_DIR" 0700 "${SERVICE_USER}:${SERVICE_GROUP}"
  ensure_dir "$CONFIG_DIR" 0755 "root:root"

  {
    printf '{\n'
    printf '  "name": "OMP Console",\n'
    printf '  "host": "%s",\n' "$(json_escape "$bind_host")"
    printf '  "port": %s,\n' "$PORT"
    printf '  "dataDir": "%s",\n' "$(json_escape "$DATA_DIR")"
    printf '  "insecureHttp": %s,\n' "$insecure"
    printf '  "connectionMode": "%s",\n' "$(json_escape "$connection_mode")"
    printf '  "publicUrl": "%s",\n' "$(json_escape "$public_url")"
    printf '  "logLevel": "info",\n'
    printf '  "storePath": "%s"\n' "$(json_escape "${DATA_DIR}/state.json")"
    printf '}\n'
  } | atomic_write "$CONFIG_FILE" 600

  if ! dry_run; then
    chown "${SERVICE_USER}:${SERVICE_GROUP}" "$CONFIG_FILE"
  fi
  log_ok "Control plane config written to ${CONFIG_FILE}."
}

render_control_unit() {
  local template="${INSTALLER_DIR}/systemd/omp-console.service.in"
  [ -r "$template" ] || die "Control plane unit template not found: ${template}."
  local rendered_dir rendered
  rendered_dir="$(make_temp_dir)"
  rendered="${rendered_dir}/omp-console.service"
  sed \
    -e "s|@SERVICE_USER@|${SERVICE_USER}|g" \
    -e "s|@SERVICE_GROUP@|${SERVICE_GROUP}|g" \
    -e "s|@PREFIX@|${PREFIX}|g" \
    -e "s|@DATA_DIR@|${DATA_DIR}|g" \
    -e "s|@CONFIG_FILE@|${CONFIG_FILE}|g" \
    -e "s|@NODE_BIN@|${NODE_BIN}|g" \
    -e "s|@BIND_HOST@|${BIND_HOST}|g" \
    -e "s|@PORT@|${PORT}|g" \
    "$template" >"$rendered"
  run install -m 0644 "$rendered" /etc/systemd/system/omp-console.service
  rm -f "$rendered"
  run systemctl daemon-reload
}

start_control_plane() {
  if service_active omp-console; then
    run systemctl restart omp-console
  else
    run systemctl enable --now omp-console
  fi
}

mint_pairing_code() {
  PAIRING_CODE=""
  if dry_run; then
    log_info "Dry run: would mint a pairing code with the control plane CLI."
    return
  fi
  local output
  output="$(
    run_as "$SERVICE_USER" env \
      OMP_CONSOLE_DATA_DIR="$DATA_DIR" \
      OMP_CONSOLE_CONFIG="$CONFIG_FILE" \
      OMP_CONSOLE_HOST="127.0.0.1" \
      OMP_CONSOLE_PORT="$PORT" \
      "$NODE_BIN" "$PREFIX/apps/backend/dist/src/cli.js" pair 2>/dev/null || true
  )"
  output="$(printf '%s\n' "$output" | tail -1)"
  case "$output" in
    "" | "(no code issued)" | *"Fatal:"*)
      log_warn "Could not mint a pairing code automatically."
      log_warn "Run: sudo -u ${SERVICE_USER} env OMP_CONSOLE_DATA_DIR=${DATA_DIR} OMP_CONSOLE_CONFIG=${CONFIG_FILE} ${NODE_BIN} ${PREFIX}/apps/backend/dist/src/cli.js pair"
      return
      ;;
  esac
  PAIRING_CODE="$output"
  log_ok "Pairing code minted."
}