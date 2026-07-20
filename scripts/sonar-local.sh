#!/bin/bash

# Local SonarCloud analysis — mirrors the `sonarcloud` job in
# .github/workflows/ci.yml so `pnpm sonar:local` analyses the SAME scope and
# coverage the CI scanner does (instead of a stale/default scope).
#
# Why this script exists:
#   sonar-project.properties intentionally OMITS sonar.sources / sonar.tests /
#   sonar.javascript.lcov.reportPaths / sonar.projectVersion — CI generates them
#   dynamically and passes them as scanner -D args (#732/#735). A bare
#   `dotenv -- sonar` (the old `sonar:local`) skipped all of that, so it
#   analysed the wrong scope and saw ~0% coverage (lcov paths stayed
#   package-relative). This script reproduces the three CI steps locally:
#     1. "Get version from core package"  → -Dsonar.projectVersion
#     2. "Compute Sonar scope"            → -Dsonar.sources / .tests / lcov paths
#     3. "Fix coverage paths"             → rewrite lcov SF: to repo-root-relative
#
# Note: this UPLOADS the analysis to SonarCloud (sonar.qualitygate.wait=true in
# sonar-project.properties → it blocks until the server returns a verdict), so
# it's a manual command, not a pre-push hook. Requires SONAR_TOKEN in .env
# (loaded by the `sonar` npm script via dotenv-cli).
#
# Usage: pnpm sonar:local

set -euo pipefail

cd "$(dirname "$0")/.."

echo "🔍 type-check..."
pnpm type-check

echo "🧪 coverage (lcov)..."
# `turbo run test` (NOT `-- --coverage`) — coverage is config-enabled in
# vitest.config.unit.mts (coverage.enabled: true), so plain `test` already
# emits lcov. This mirrors CI's "Test with coverage" step exactly. The
# `-- --coverage` passthrough is deliberately avoided: it gives `test` a
# distinct turbo cache key (→ cold full re-run every time, slow) and forces
# every jsdom package to execute coverage concurrently, which triggers a
# Node worker-thread `ReadFileUtf8`/`uv_fs_close` native abort under load.
# Same reason ci.yml dropped it — do NOT re-add. See IMPLEMENTATION_NOTES.
pnpm test

# 1 + 2: projectVersion + analysis scope (mirrors CI "Get version" / "Compute
# Sonar scope"). --emit prints `sources=…`, `tests=…`, `reports=…` lines — the
# same source of truth that guards codecov.yml / sonar-project.properties.
echo "📐 resolving version + scope..."
VERSION="$(node -p 'require("./packages/core/package.json").version')"
SCOPE="$(node scripts/check-coverage-scope.mjs --emit)"
SOURCES="$(printf '%s\n' "$SCOPE" | sed -n 's/^sources=//p')"
TESTS="$(printf '%s\n' "$SCOPE" | sed -n 's/^tests=//p')"
REPORTS="$(printf '%s\n' "$SCOPE" | sed -n 's/^reports=//p')"

if [ -z "$SOURCES" ] || [ -z "$REPORTS" ]; then
  echo "❌ failed to compute Sonar scope (check-coverage-scope.mjs --emit)" >&2
  exit 1
fi

# 3: rewrite lcov paths (mirrors CI "Fix coverage paths"). vitest writes
# package-relative SF:src/… and SF:../../shared/… ; the scanner runs from the
# repo root and needs SF:packages/<pkg>/src/… (shared collapsed to shared/<dir>/…).
# Uses a temp file instead of `sed -i` so it works under both BSD sed (macOS dev)
# and GNU sed (CI/Linux). `-E` is honoured by both.
echo "🩹 rewriting lcov paths..."
find packages -path '*/coverage/lcov.info' -print0 2>/dev/null |
  while IFS= read -r -d '' lcov; do
    # Idempotent guard: a freshly-generated lcov has only SF:src/… and
    # SF:../../shared/… ; if it's already repo-root-relative (re-run without
    # regenerating coverage), skip — a second prefix pass would double the path.
    if grep -qE '^SF:(packages|shared)/' "$lcov"; then
      continue
    fi
    pkg_dir="${lcov%/coverage/lcov.info}"
    sed -E -e "s|^SF:|SF:${pkg_dir}/|" \
           -e 's|^SF:packages/[^/]+/\.\./\.\./|SF:|' \
           "$lcov" >"$lcov.tmp"
    mv "$lcov.tmp" "$lcov"
  done

# 4: run the scanner directly via dotenv — NOT `pnpm run sonar -- …`.
# `pnpm run <script> -- <args>` forwards <args> behind a literal `--`, and
# @sonar/scan v5's commander CLI (`-D, --define <property=value...>`, zero
# positional args) treats every token after `--` as a positional operand:
# `error: too many arguments. Expected 0 arguments but got 4.`. Passing the
# flags as plain options (no intervening `--`) parses them as -D defines.
# Auth: dotenv loads SONAR_TOKEN from .env into the child env; the scanner
# maps the SONAR_TOKEN env var → sonar.token (src/constants.js), so no
# -Dsonar.login is needed (it's deprecated, and the old `$SONAR_TOKEN`
# expansion in the `sonar` script ran in a shell without .env → always empty).
# Mirrors CI "SonarCloud Scan".
echo "☁️  running SonarCloud scan..."
exec pnpm exec dotenv -- sonar-scanner-npm \
  -Dsonar.projectVersion="$VERSION" \
  -Dsonar.sources="$SOURCES" \
  -Dsonar.tests="$TESTS" \
  -Dsonar.javascript.lcov.reportPaths="$REPORTS"
