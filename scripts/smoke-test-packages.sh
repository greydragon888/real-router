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

# Packages that cannot be imported in plain Node.js (`types` used to head this
# list; the package was folded into core as the /types subpath in wave-2):
# - solid: solid-js runtime requires browser/DOM environment
# - svelte: .svelte files require Svelte compiler
# - angular: needs @angular/compiler + DI context at import time
#            (e.g. PlatformLocation triggers JIT compilation of injectables)
SKIP_IMPORT="@real-router/solid @real-router/svelte @real-router/angular"

# Subpaths whose export map declares `require` but whose CJS entry cannot be
# loaded in practice. Keep this TINY and justified — like SKIP_IMPORT it is an
# escape hatch, and every entry here is a defect to fix upstream, not a rule.
#
# Currently EMPTY, and that is the point: its only entry was
# @real-router/react/ink, whose `require` condition could never load (it requires
# ESM-only ink@7, which has top-level await). The fix was to drop the condition —
# the subpath is now ESM-only, so this loop classifies it from the export map and
# skips its CJS pass without needing an exception (#1628). An empty list must
# match NOTHING; see the `grep -qxF` note at the call site.
SKIP_REQUIRE=""
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
# Use npm (not pnpm) to simulate real consumer experience.
#
# `--strict-allow-scripts=true` pins the npm-12 posture as a TESTED INVARIANT
# rather than a lucky property of today's tree. npm 12 (already `latest`) makes
# dependency lifecycle scripts opt-in: unapproved `preinstall`/`install`/
# `postinstall` and implicit node-gyp builds are skipped with a warning and the
# install still SUCCEEDS. That permissive default is exactly what would let an
# install script silently appear in a published package's tree and only surface
# as breakage on a consumer's machine. The strict flag turns the same situation
# into a red CI run here. Verified against the real npm@12.0.2 that the current
# tree (local tarballs + the optional `ink` peer) passes both with v12 defaults
# and with this flag; npm silently ignores unknown flags, so on an older bundled
# npm (< 11.16) this degrades to a no-op rather than failing. See #1596 item 6.
(cd "$PROJECT_DIR" && npm install --install-strategy=hoisted --strict-allow-scripts=true "${INSTALL_ARGS[@]}" "${OPTIONAL_PEERS[@]}" 2>&1) | tail -3

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

  # Extract export subpaths, tagging each with whether its entry declares a
  # `require` condition. Both halves of a dual build must be exercised: the ESM
  # side alone never loads dist/cjs, so a broken CJS bundle (bad interop, missing
  # file, syntax error from the second tsdown format) shipped green — publint
  # only reads the manifest and attw only resolves TYPES under `require`, neither
  # executes the CJS entry. The tag keeps that honest: angular ships FESM2022 and
  # svelte ships svelte-package output, both a single ESM `default`, so a blind
  # require() on them would be a false red rather than a finding. (Audit §4.6.)
  entries=$(node -e "
    const pkg = require('$pkg_json');
    const exports = pkg.exports || {};
    // A 'require' condition anywhere except inside 'types' (which resolves .d.ts,
    // not runtime code) means the entry has a real CJS build.
    const hasRequire = (value) =>
      typeof value === 'object' && value !== null &&
      Object.entries(value).some(([key, sub]) => key === 'require' || (key !== 'types' && hasRequire(sub)));
    for (const [key, value] of Object.entries(exports)) {
      const spec = key === '.' ? pkg.name : pkg.name + '/' + key.slice(2);
      console.log(spec + ' ' + (hasRequire(value) ? 'dual' : 'esm-only'));
    }
  " 2>/dev/null || echo "$pkg_name esm-only")

  while read -r subpath kind; do
    [ -z "$subpath" ] && continue

    # ESM side (must run from the consumer project dir so resolution is a real
    # consumer's resolution, not the workspace's).
    result=$(cd "$PROJECT_DIR" && node --input-type=module -e "
      import('$subpath')
        .then(() => console.log('OK'))
        .catch(e => { console.log('FAIL: ' + e.message.split('\n')[0]); process.exit(1); });
    " 2>&1) || true

    if echo "$result" | grep -q "^OK"; then
      PASSED=$((PASSED + 1))
    else
      echo "  FAIL: $subpath (esm) — $result"
      FAILED=$((FAILED + 1))
    fi

    # CJS side, only where the export map actually declares `require` and the
    # subpath is not a documented exception. `printf | grep -qxF` (whole-line,
    # fixed-string) rather than `grep -qw`: an empty exception list must match
    # NOTHING, and a bare `grep -qw ""` would match every subpath and silently
    # disable the whole CJS check.
    # shellcheck disable=SC2086
    if [ "$kind" = "dual" ] && ! printf '%s\n' $SKIP_REQUIRE | grep -qxF "$subpath"; then
      result=$(cd "$PROJECT_DIR" && node -e "
        try { require('$subpath'); console.log('OK'); }
        catch (e) { console.log('FAIL: ' + e.message.split('\n')[0]); process.exit(1); }
      " 2>&1) || true

      if echo "$result" | grep -q "^OK"; then
        PASSED=$((PASSED + 1))
      else
        echo "  FAIL: $subpath (cjs) — $result"
        FAILED=$((FAILED + 1))
      fi
    fi
  done <<< "$entries"
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
