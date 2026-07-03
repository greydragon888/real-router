#!/usr/bin/env bash
# Normalize lcov.info source paths for Codecov + SonarCloud (CI-only).
#
# vitest emits package-relative source paths (SF:src/plugin.ts); Codecov and
# SonarCloud both need project-root-relative paths
# (SF:packages/browser-plugin/src/plugin.ts). This rewrites every produced
# lcov.info in place. Called from the three coverage-producing jobs in ci.yml
# (pipeline-leaf / base-test / pipeline-sharded) — ONE source of truth so the
# rewrite can't drift between the (formerly triple-duplicated) steps (#1132).
#
# GNU sed only (`sed -i` with no backup suffix) — runs on the CI Ubuntu runner;
# do NOT run on macOS/BSD sed (which needs `sed -i ''`).
set -euo pipefail

# NUL-delimited find | while-read (not `for … in $(find)`) — robust to
# whitespace and avoids shellcheck SC2044; ${lcov%…} parameter expansion
# replaces an echo|sed subshell (SC2001).
find packages shared -path '*/coverage/lcov.info' -print0 2>/dev/null |
  while IFS= read -r -d '' lcov; do
    pkg_dir="${lcov%/coverage/lcov.info}"
    sed -i "s|^SF:|SF:${pkg_dir}/|" "$lcov"
    # Shared-source owners (#809) emit SF:../../shared/<dir>/x.ts — the prefix
    # above turns those into packages/<owner>/../../shared/…; collapse the
    # parent-dir hops to repo-root-relative shared/<dir>/x.ts so Codecov
    # components and Sonar score them at their real location.
    sed -i -E 's|^SF:packages/[^/]+/\.\./\.\./|SF:|' "$lcov"
  done
