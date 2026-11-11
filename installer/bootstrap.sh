#!/usr/bin/env bash
# One-command bootstrap: download the repo tarball and run the installer.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/orev7s/omp-console/main/installer/bootstrap.sh \
#     | sudo bash -s -- --mode domain --domain console.example.com --yes
#
# This downloads and runs code from the repository. Use the clone method in the
# README if you prefer to inspect the tree first.

set -Eeuo pipefail

REPO="${OMP_CONSOLE_REPO:-orev7s/omp-console}"
REF="${OMP_CONSOLE_REF:-main}"
TMP="$(mktemp -d)"

cleanup() {
  rm -rf "$TMP"
}
trap cleanup EXIT

command -v curl >/dev/null 2>&1 || {
  echo "curl is required." >&2
  exit 1
}
command -v tar >/dev/null 2>&1 || {
  echo "tar is required." >&2
  exit 1
}

echo "==> Downloading ${REPO} (${REF})." >&2
curl -fL --retry 3 --retry-delay 2 -o "$TMP/src.tar.gz" \
  "https://codeload.github.com/${REPO}/tar.gz/refs/heads/${REF}"

echo "==> Extracting." >&2
tar -xzf "$TMP/src.tar.gz" -C "$TMP"

DIR="$(find "$TMP" -maxdepth 1 -type d -name 'omp-console-*' | head -1)"
if [ -z "$DIR" ]; then
  echo "Could not find the extracted repository under ${TMP}." >&2
  exit 1
fi

cd "$DIR"
exec ./installer/install.sh "$@"