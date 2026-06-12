#!/usr/bin/env bash
# Reliable Electron binary installer for CI (#812). Linux/x64 only (ubuntu runner).
#
# Both electron's own install.js AND a Node wrapper around @electron/get proved
# unreliable on the GitHub ubuntu runner: the download promise does not keep the
# event loop alive there, so the process exits 0 *at the await* — before
# path.txt is written and before any postcondition guard runs (a green step that
# installed nothing). Locally on macOS the same download keeps the loop alive,
# hiding the race. See IMPLEMENTATION_NOTES "Electron e2e".
#
# This script sidesteps Node/ESM/fetch entirely: curl (a separate process that
# `set -e` waits for) downloads the release zip, sha256 is verified against
# electron's own checksums.json (catches truncated downloads), unzip extracts
# the binary, and the postcondition is a plain `[ -f ]` test that always runs.
set -euo pipefail

# CI-only: the zip name, the path.txt payload ('electron'), and the unzip
# layout are all linux-x64 specific. Running this locally (macOS/arm) would
# wipe the native dist/ and install a foreign binary — refuse loudly. This
# also fails fast if the CI runner ever moves to an arm image (the script
# would otherwise silently install an x64 binary that can't exec).
if [ "$(uname -s)/$(uname -m)" != "Linux/x86_64" ]; then
  echo "::error::ci-install-electron.sh is CI-only (linux-x64); refusing to run on $(uname -s)/$(uname -m)"
  exit 1
fi

# All three desktop/electron/* examples share one .pnpm/electron@X, so resolving
# via one example materialises the binary for all.
electron_dir="$(pnpm --filter electron-react-example exec node -p "path.dirname(require.resolve('electron/package.json'))" | tail -n1)"
version="$(node -p "require('${electron_dir}/package.json').version")"
zipname="electron-v${version}-linux-x64.zip"
url="https://github.com/electron/electron/releases/download/v${version}/${zipname}"

cache_dir="${HOME}/.cache/electron-zip"
zip="${cache_dir}/${zipname}"
mkdir -p "${cache_dir}"

expected="$(node -p "require('${electron_dir}/checksums.json')['${zipname}']")"

verify() { [ -f "$zip" ] && [ "$(sha256sum "$zip" | cut -d' ' -f1)" = "${expected}" ]; }
download() {
  echo "Downloading ${url} ..."
  curl -fsSL --retry 3 --retry-delay 2 "${url}" -o "${zip}"
}

if verify; then
  echo "Using cached ${zipname}"
else
  download
  if ! verify; then
    # curl --retry doesn't cover a truncated 200 OK body — one full re-download
    # before giving up, so a single flaky transfer doesn't fail the run.
    echo "::warning::Checksum mismatch for ${zipname} — retrying download once"
    rm -f "${zip}"
    download
    if ! verify; then
      echo "::error::Checksum mismatch for ${zipname} (expected ${expected})"
      rm -f "${zip}"
      exit 1
    fi
  fi
fi

# Drop zips of other electron versions that restore-keys may have restored —
# otherwise the cache entry grows by ~128 MB with every electron bump.
find "${cache_dir}" -name 'electron-v*.zip' ! -name "${zipname}" -delete

rm -rf "${electron_dir}/dist"
mkdir -p "${electron_dir}/dist"
unzip -q "${zip}" -d "${electron_dir}/dist"
printf 'electron' > "${electron_dir}/path.txt"

if [ ! -f "${electron_dir}/dist/electron" ] || [ ! -f "${electron_dir}/path.txt" ]; then
  echo "::error::electron binary or path.txt missing after extract"
  exit 1
fi
echo "Electron ${version} installed at ${electron_dir}/dist/electron"
