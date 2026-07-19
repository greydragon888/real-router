#!/bin/bash
set -euo pipefail

# Smoke test: pack all public packages, install from tarballs into
# an isolated temp project, and verify that every export resolves.
#
# Catches:
# - Private packages leaking into dependencies (#413)
# - Source files shipped in tarball causing Vite resolve failures (#418)
# - Broken export paths, missing dist files
#
# Usage: bash scripts/smoke-test-packages.sh

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Packages that cannot be imported in plain Node.js:
# - types: types-only package, no runtime exports
# - solid: solid-js runtime requires browser/DOM environment
# - svelte: .svelte files require Svelte compiler
# - angular: needs @angular/compiler + DI context at import time
#            (e.g. PlatformLocation triggers JIT compilation of injectables)
SKIP_IMPORT="@real-router/solid @real-router/svelte @real-router/angular"
TEMP_DIR="$(mktemp -d)"
TARBALLS_DIR="$TEMP_DIR/tarballs"
PROJECT_DIR="$TEMP_DIR/consumer"

cleanup() {
  rm -rf "$TEMP_DIR"
}
trap cleanup EXIT

mkdir -p "$TARBALLS_DIR" "$PROJECT_DIR"

echo "=== Phase 1: Pack all public packages ==="

# Collect public package names and pack them
PACKAGES=()
for pkg_json in "$REPO_ROOT"/packages/*/package.json; do
  # Skip private packages. Read the actual JSON field — `grep '"private"'`
  # also matched `"private": false` and any "private" substring elsewhere,
  # misclassifying a public package as private (#810 audit 3.4).
  if [ "$(node -p "require('$pkg_json').private === true" 2>/dev/null)" = "true" ]; then
    continue
  fi

  pkg_dir="$(dirname "$pkg_json")"
  pkg_name="$(node -e "console.log(require('$pkg_json').name)")"
  PACKAGES+=("$pkg_name")

  echo "  Packing $pkg_name..."
  (cd "$pkg_dir" && pnpm pack --pack-destination "$TARBALLS_DIR") > /dev/null 2>&1
done

# Fail loudly if nothing was packed. Doubles as bash-3.2 safety: expanding an
# EMPTY array with "${arr[@]}" under `set -u` is an "unbound variable" error on
# bash 3.2 (the CLAUDE.md lower bound for locally-run scripts; CI's bash 5 is
# unaffected) — past this guard every "${PACKAGES[@]}" expansion is non-empty.
# `${#arr[@]}` (length) is safe on empty arrays even on 3.2.
if [ "${#PACKAGES[@]}" -eq 0 ]; then
  echo "ERROR: no public packages found under packages/ — nothing to smoke-test"
  exit 1
fi

echo "  Packed ${#PACKAGES[@]} packages"

echo ""
echo "=== Phase 2: Create isolated consumer project ==="

# Minimal package.json
cat > "$PROJECT_DIR/package.json" << 'PKGJSON'
{
  "name": "smoke-test-consumer",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "dependencies": {}
}
PKGJSON

# Install all tarballs
echo "  Installing from tarballs..."
INSTALL_ARGS=()
for tarball in "$TARBALLS_DIR"/*.tgz; do
  INSTALL_ARGS+=("$tarball")
done

# Same guard pair as PACKAGES above: an empty tarball set means the pack phase
# silently produced nothing (would reach `npm install` as a literal unmatched
# glob), and a non-empty guarantee keeps "${INSTALL_ARGS[@]}" bash-3.2-safe.
if [ "${#INSTALL_ARGS[@]}" -eq 0 ]; then
  echo "ERROR: no tarballs in $TARBALLS_DIR — pack phase produced nothing"
  exit 1
fi

# Optional peer deps are not auto-installed by npm — add them explicitly so
# their subpath entries can be imported by Phase 3. A real consumer using
# `@real-router/react/ink` would install `ink` themselves.
OPTIONAL_PEERS=(
  "ink@^7.0.0"
)

# Install with --install-strategy=hoisted to simulate flat npm layout
# Use npm (not pnpm) to simulate real consumer experience
(cd "$PROJECT_DIR" && npm install --install-strategy=hoisted "${INSTALL_ARGS[@]}" "${OPTIONAL_PEERS[@]}" 2>&1) | tail -3

echo ""
echo "=== Phase 3: Verify all exports resolve ==="

FAILED=0
PASSED=0

for pkg_name in "${PACKAGES[@]}"; do
  # Skip packages that can't be imported in Node.js
  if echo "$SKIP_IMPORT" | grep -qw "$pkg_name"; then
    # Still verify the package was installed
    if [ -d "$PROJECT_DIR/node_modules/$pkg_name" ]; then
      PASSED=$((PASSED + 1))
      continue
    else
      echo "  FAIL: $pkg_name — not installed"
      FAILED=$((FAILED + 1))
      continue
    fi
  fi

  # Get all export subpaths from package.json
  pkg_json="$PROJECT_DIR/node_modules/$pkg_name/package.json"

  if [ ! -f "$pkg_json" ]; then
    echo "  FAIL: $pkg_name — not installed"
    FAILED=$((FAILED + 1))
    continue
  fi

  # Extract export subpaths and verify each one resolves
  subpaths=$(node -e "
    const pkg = require('$pkg_json');
    const exports = pkg.exports || {};
    for (const key of Object.keys(exports)) {
      // Skip conditions that are objects (handle '.' and subpaths)
      console.log(key === '.' ? pkg.name : pkg.name + '/' + key.slice(2));
    }
  " 2>/dev/null || echo "$pkg_name")

  for subpath in $subpaths; do
    # Try to resolve the import (must run from consumer project dir)
    result=$(cd "$PROJECT_DIR" && node --input-type=module -e "
      import('$subpath')
        .then(() => console.log('OK'))
        .catch(e => { console.log('FAIL: ' + e.message.split('\n')[0]); process.exit(1); });
    " 2>&1) || true

    if echo "$result" | grep -q "^OK"; then
      PASSED=$((PASSED + 1))
    else
      echo "  FAIL: $subpath — $result"
      FAILED=$((FAILED + 1))
    fi
  done
done

echo ""
echo "=== Results ==="
echo "  Passed: $PASSED"
echo "  Failed: $FAILED"

if [ "$FAILED" -gt 0 ]; then
  echo ""
  echo "Smoke test FAILED — $FAILED export(s) could not be resolved"
  exit 1
fi

echo ""
echo "All $PASSED exports resolve correctly from consumer perspective"
