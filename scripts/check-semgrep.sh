#!/bin/bash

# Diff-aware static analysis (SAST) via semgrep — a fast, local complement to the
# cloud CodeQL scan. Catches injection / incomplete-sanitization / dangerous-API
# classes BEFORE push instead of waiting for CI.
#
# Scope: only findings INTRODUCED by the current branch (--baseline-commit against
# the merge-base with origin/master), so a pre-existing finding never blocks an
# unrelated push and a legacy codebase doesn't drown the hook.
#
# Rulesets:
#   - p/javascript  — semgrep registry breadth (fetched once, then cached;
#                     needs network on first run only)
#   - .semgrep/     — local custom rules (e.g. incomplete-multi-character
#                     sanitization, the class CodeQL flagged on validateRoutePath)
#
# Skips gracefully when semgrep isn't available (tries `semgrep`, then `uvx
# semgrep`) — keeps the hook non-blocking for fresh clones. Install with:
#   brew install semgrep        (or: uv tool install semgrep)
#
# Exit handling: findings (exit 1) BLOCK the push; tool/network errors (exit >=2)
# only WARN — CI CodeQL remains the authoritative gate either way.
#
# Usage: ./scripts/check-semgrep.sh

set -e

# Resolve a semgrep runner (installed binary preferred, else ephemeral uvx).
if command -v semgrep >/dev/null 2>&1; then
  SEMGREP=(semgrep)
elif command -v uvx >/dev/null 2>&1; then
  # `uvx semgrep` crashes on system Python <3.12 with
  # "ModuleNotFoundError: No module named 'pkg_resources'" — semgrep's
  # opentelemetry dependency imports it, and setuptools >=81 dropped it.
  # Pinning setuptools <81 in the ephemeral env restores pkg_resources.
  SEMGREP=(uvx --quiet --with 'setuptools<81' semgrep)
else
  echo "⚠️  semgrep not found — skipping SAST diff scan."
  echo "    Install with: brew install semgrep   (or: uv tool install semgrep)"
  echo "    (Hook stays non-blocking; CI CodeQL still runs.)"
  exit 0
fi

# Only scan shipped source; tests/benchmarks build throwaway adversarial inputs
# that trip security heuristics with no shipped risk.
TARGETS="packages shared"

# Baseline: the merge-base with origin/master → report only NEW findings.
BASELINE=""
if git rev-parse --verify origin/master >/dev/null 2>&1; then
  BASELINE="$(git merge-base origin/master HEAD 2>/dev/null || echo "")"
fi

BASELINE_ARG=""
if [ -n "$BASELINE" ] && [ "$BASELINE" != "$(git rev-parse HEAD)" ]; then
  BASELINE_ARG="--baseline-commit $BASELINE"
fi

set +e
# BASELINE_ARG and TARGETS are intentionally word-split into separate arguments.
# shellcheck disable=SC2086
"${SEMGREP[@]}" scan \
  --config p/javascript \
  --config .semgrep/ \
  --include '**/src/**' \
  $BASELINE_ARG \
  --error --quiet \
  $TARGETS
exit_code=$?
set -e

if [ $exit_code -eq 1 ]; then
  echo ""
  echo "❌ Semgrep found newly-introduced issue(s). Triage:"
  echo "   1. Fix the flagged code (preferred)."
  echo "   2. If a confirmed false positive, add '// nosemgrep: <rule-id>' on the line."
  exit 1
elif [ $exit_code -ge 2 ]; then
  echo "⚠️  semgrep errored (exit $exit_code — likely network/setup); not blocking the push."
  echo "    (CI CodeQL still gates the PR.)"
  exit 0
fi

exit 0
