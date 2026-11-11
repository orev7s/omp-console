#!/usr/bin/env bash
# Oh My Pi (omp) detection and installation.
#
# The official installer is a remote script. It is downloaded to a private temp
# file, its SHA256 is shown, and it is only run after confirmation (or --yes).
# The version is recorded for the install marker.

omp_ok() {
  command -v omp >/dev/null 2>&1
}

installed_omp_version() {
  if omp_ok; then
    omp --version 2>/dev/null | head -1
  fi
}

install_omp() {
  if [ "${SKIP_OMP:-0}" = "1" ]; then
    log_info "Skipping omp (--no-omp). The control plane does not need it in Phase 2."
    return
  fi

  if omp_ok; then
    OMP_VERSION="$(installed_omp_version)"
    log_ok "omp found: ${OMP_VERSION:-unknown version}"
    return
  fi

  log_warn "omp is not installed."
  log_warn "The official installer is https://omp.sh/install. It is a remote script, so its SHA256 is shown before it runs."

  if dry_run; then
    log_info "Dry run: would download and run the official omp installer."
    return
  fi

  local tmp
  local script
  tmp="$(make_temp_dir)"
  script="$tmp/omp-install.sh"
  download "https://omp.sh/install" "$script" || die "Could not download the omp installer from https://omp.sh/install."
  [ -s "$script" ] || die "The omp installer download is empty. Check https://omp.sh/install."

  local digest
  digest="$(sha256_file "$script")"
  log_info "omp installer SHA256: ${digest}"

  if ! confirm "Run the official omp installer now?"; then
    rm -rf "$tmp"
    die "Aborted before installing omp. Rerun with --no-omp if you only need the control plane."
  fi

  if dry_run; then
    log_info "Dry run: would run the downloaded omp installer."
    rm -rf "$tmp"
    return
  fi

  if ! sh "$script"; then
    rm -rf "$tmp"
    die "omp installation failed. Install omp manually from https://omp.sh, then rerun."
  fi
  rm -rf "$tmp"
  hash -r

  if ! omp_ok; then
    local candidate
    for candidate in "${HOME:-/root}/.local/bin/omp" "/root/.local/bin/omp" "/usr/local/bin/omp"; do
      if [ -x "$candidate" ]; then
        log_info "Installing omp from ${candidate} to /usr/local/bin/omp for system-wide use."
        run install -m 0755 "$candidate" /usr/local/bin/omp
        hash -r
        break
      fi
    done
  fi

  omp_ok || log_warn "omp was not found on PATH after installation. The control plane does not need it in Phase 2. Add it to PATH before Phase 4."
  OMP_VERSION="$(installed_omp_version)"
  log_ok "omp installed: ${OMP_VERSION:-unknown version}"
}