#!/usr/bin/env bash
# Node.js detection and installation.
#
# Target is Node 26 LTS, with Node 24 as the fallback. The official tarball is
# used on glibc, and the official musl tarball on x64 musl. Other musl
# architectures fall back to the distribution package.

: "${OMP_CONSOLE_NODE_MAJOR:=26}"

node_major() {
  node -v 2>/dev/null | sed 's/^v//' | cut -d. -f1
}

node_ok() {
  local major
  major="$(node_major || true)"
  [ "$major" = "24" ] || [ "$major" = "26" ]
}

resolve_node_version() {
  local major="$1"
  local version
  version="$(
    curl -fsS --max-time 20 https://nodejs.org/dist/index.json 2>/dev/null |
      sed -n "s/.*\"version\":\"\\(v${major}\\.[0-9.]*\\)\".*/\\1/p" |
      head -1
  )"
  [ -n "$version" ] || return 1
  printf '%s' "$version"
}

node_tarball_suffix() {
  case "$ARCH:$LIBC" in
    amd64:glibc) printf 'linux-x64' ;;
    arm64:glibc) printf 'linux-arm64' ;;
    amd64:musl) printf 'linux-x64-musl' ;;
    *) return 1 ;;
  esac
}

install_node_from_tarball() {
  local version="$1"
  local suffix="$2"
  local base="https://nodejs.org/dist/${version}"
  local tarball="node-${version}-${suffix}.tar.gz"
  local tmp
  tmp="$(make_temp_dir)"

  log_info "Downloading Node ${version} (${suffix})."
  download "${base}/SHASUMS256.txt" "$tmp/SHASUMS256.txt"
  download "${base}/${tarball}" "$tmp/${tarball}"

  if ! (cd "$tmp" && grep " ${tarball}\$" SHASUMS256.txt | sha256sum -c - >/dev/null); then
    rm -rf "$tmp"
    die "Node ${version} checksum verification failed. Refusing to install."
  fi

  run install -d -m 0755 /usr/local/lib/nodejs
  if ! dry_run; then
    rm -rf "/usr/local/lib/nodejs/node-${version}-${suffix}"
  fi
  run tar -xzf "$tmp/${tarball}" -C /usr/local/lib/nodejs

  local bin
  for bin in node npm npx corepack; do
    if [ -x "/usr/local/lib/nodejs/node-${version}-${suffix}/bin/${bin}" ]; then
      run ln -sf "/usr/local/lib/nodejs/node-${version}-${suffix}/bin/${bin}" "/usr/local/bin/${bin}"
    fi
  done

  rm -rf "$tmp"
  hash -r
}

install_node() {
  if node_ok; then
    NODE_BIN="$(command -v node)"
    log_ok "Node $(node -v) found at ${NODE_BIN}."
    command -v npm >/dev/null 2>&1 || die "npm is missing from the Node installation. Reinstall Node 24 or 26."
    return
  fi

  local current=""
  if command -v node >/dev/null 2>&1; then
    current="$(node -v)"
    log_warn "Node ${current} is not a supported LTS. Installing a supported version."
  fi

  local version="${OMP_CONSOLE_NODE_VERSION:-}"
  if [ -z "$version" ]; then
    version="$(resolve_node_version "$OMP_CONSOLE_NODE_MAJOR" || true)"
  fi
  if [ -z "$version" ] && [ "$OMP_CONSOLE_NODE_MAJOR" != "24" ]; then
    log_warn "Could not resolve Node ${OMP_CONSOLE_NODE_MAJOR}. Trying Node 24."
    version="$(resolve_node_version 24 || true)"
  fi
  [ -n "$version" ] || die "Could not resolve a Node.js release. Set OMP_CONSOLE_NODE_VERSION to a full version such as v26.13.1."

  local suffix
  suffix="$(node_tarball_suffix || true)"
  if [ -z "$suffix" ]; then
    if [ "$PKG_MANAGER" = "apk" ]; then
      log_warn "No official Node tarball for ${ARCH}/${LIBC}. Installing the Alpine package."
      run apk add --no-cache nodejs npm
      hash -r
      node_ok || die "The Alpine Node package is not 24 or 26. Install Node ${version} manually."
      NODE_BIN="$(command -v node)"
      log_ok "Node $(node -v) installed from Alpine."
      return
    fi
    die "No supported Node tarball for ${ARCH}/${LIBC}. Install Node 24 or 26 manually and rerun."
  fi

  if dry_run; then
    NODE_BIN="${NODE_BIN:-$(command -v node || echo node)}"
    log_info "Dry run: would install Node ${version} (${suffix})."
    return
  fi

  install_node_from_tarball "$version" "$suffix"
  node_ok || die "Node $(node -v) was installed but is not 24 or 26."
  NODE_BIN="$(command -v node)"
  command -v npm >/dev/null 2>&1 || die "npm is missing after installing Node ${version}."
  log_ok "Node $(node -v) installed at ${NODE_BIN}."
}