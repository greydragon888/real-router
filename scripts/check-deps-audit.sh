#!/bin/bash

# Vulnerability scan over pnpm-lock.yaml + all Cargo.lock via osv-scanner.
# Mirrors the GHSA database used by GitHub Dependency Review, but runs
# locally before push instead of waiting for CI.
#
# Skips gracefully when osv-scanner isn't installed — keeps the hook
# non-blocking for fresh clones. Install with:
#   brew install osv-scanner
# or download from https://github.com/google/osv-scanner/releases.
#
# Usage: ./scripts/check-deps-audit.sh

set -e

if ! command -v osv-scanner >/dev/null 2>&1; then
  echo "⚠️  osv-scanner not found — skipping dependency audit."
  echo "    Install with: brew install osv-scanner"
  echo "    (Hook stays non-blocking; CI Dependency Review still runs.)"
  exit 0
fi

# Config (scripts/osv-scanner.toml) mirrors .github/workflows/codeql.yml
# allow-ghsas + adds RUSTSEC unmaintained advisories that GitHub Dependency
# Review doesn't flag (no CVSS) but osv-scanner does.
set +e
# --verbosity warn silences osv-scanner's per-ignore "<id> has been filtered out because:
# <reason>" info logging — one line per IgnoredVulns entry × each matching lockfile (~40 lines,
# doubled by the two identical Tauri desktop-example Cargo.lock files). The results table and
# exit code are result output, not logging, so real findings still surface at warn level.
osv-scanner scan source --config=scripts/osv-scanner.toml --recursive . --verbosity warn
exit_code=$?
set -e

if [ $exit_code -ne 0 ]; then
  echo ""
  echo "❌ Vulnerabilities detected. Triage steps:"
  echo "   1. Bump the affected package (prefer patch/minor)."
  echo "   2. If unfixable & non-shipped (example/dev), add to"
  echo "      scripts/osv-scanner.toml and .github/workflows/codeql.yml."
fi

exit $exit_code
