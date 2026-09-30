#!/bin/bash

# Diff-aware static analysis (SAST) via semgrep — a fast, local complement to the
# cloud CodeQL scan. Catches injection / incomplete-sanitization / dangerous-API
# classes BEFORE push instead of waiting for CI.
#
# Scope: only findings INTRODUCED by the current branch (--baseline-commit against
# the merge-base with origin/master), so a pre-existing finding never blocks an
# unrelated push and a legacy codebase doesn't drown the hook.
#
# Two scans, each with its own strictness:
#   - .semgrep/     — our rules (e.g. incomplete-multi-character sanitization,
#                     the class CodeQL flagged on validateRoutePath). Local
#                     files that nothing else runs: in CI a failure of this scan
#                     is red.
#   - p/javascript  — semgrep registry breadth, fetched on each run. Its failure
#                     only warns: CodeQL covers part of it.
# Findings block in either, in every stage.
#
# The stage is VERIFY_STAGE, which `scripts/verify.mjs` sets; without it, `ci`
# when GITHUB_ACTIONS is true, a hook otherwise.
#
#   - ci: semgrep comes from `uvx` at SEMGREP_VERSION, with its dependencies no
#     newer than SEMGREP_EXCLUDE_NEWER; either one unset, or no uvx, fails, and
#     a semgrep binary on PATH is not used. semgrep that cannot be fetched is
#     red (exit 3), and so is our rules' scan that errors.
#   - a hook: the semgrep binary, else `uvx semgrep`; none of them is a skip,
#     and so is semgrep that cannot be fetched. A binary below SEMGREP_FLOOR
#     refuses with exit 3.
#
# Before either scan: a rule set or target missing from the checkout, or a
# `.semgrep/` that loads no rule, fails (exit 1) — the checkout's own breakage.
# The rules are counted offline, on a fixture.
#
# Usage: ./scripts/check-semgrep.sh   (from any directory)

set -e

# Everything is resolved from the script's own location, never from the cwd
# (#2544). From a subdirectory, `.semgrep/` and the targets would not resolve:
# semgrep exits 7 for a missing config.
cd "$(dirname "$0")/.."

# The version CI pins; a local semgrep below it may read our rules otherwise.
SEMGREP_FLOOR="1.178.0"

STAGE="${VERIFY_STAGE:-}"
if [ -z "$STAGE" ]; then
  if [ "${GITHUB_ACTIONS:-}" = "true" ]; then STAGE="ci"; else STAGE="hook"; fi
fi

# `uvx semgrep` crashes on system Python <3.12 with
# "ModuleNotFoundError: No module named 'pkg_resources'" — semgrep's
# opentelemetry dependency imports it, and setuptools >=81 dropped it.
# Pinning setuptools <81 in the ephemeral env restores pkg_resources.
UVX_WITH=(--with 'setuptools<81')

if [ "$STAGE" = "ci" ]; then
  missing=""
  [ -n "${SEMGREP_VERSION:-}" ] || missing="$missing SEMGREP_VERSION"
  [ -n "${SEMGREP_EXCLUDE_NEWER:-}" ] || missing="$missing SEMGREP_EXCLUDE_NEWER"
  command -v uvx >/dev/null 2>&1 || missing="$missing uvx"
  if [ -n "$missing" ]; then
    echo "❌ semgrep in CI needs SEMGREP_VERSION, SEMGREP_EXCLUDE_NEWER and uvx; missing:$missing — nothing was scanned."
    exit 3
  fi
  SEMGREP=(uvx --quiet --exclude-newer "$SEMGREP_EXCLUDE_NEWER" "${UVX_WITH[@]}" "semgrep==$SEMGREP_VERSION")
elif command -v semgrep >/dev/null 2>&1; then
  SEMGREP=(semgrep)
elif command -v uvx >/dev/null 2>&1; then
  SEMGREP=(uvx --quiet "${UVX_WITH[@]}" semgrep)
else
  echo "⚠️  semgrep not found — skipping SAST diff scan."
  echo "    Install with: brew install semgrep   (or: uv tool install semgrep)"
  echo "    (Hook stays non-blocking; CI runs it with a pinned version.)"
  exit 0
fi

# Only scan shipped source; tests/benchmarks build throwaway adversarial inputs
# that trip security heuristics with no shipped risk.
TARGETS="packages shared"

# A rule set or target that is not there is this checkout's own breakage, not a
# tool or network error, so it is refused before semgrep runs.
for subject in .semgrep $TARGETS; do
  if [ ! -d "$subject" ]; then
    echo "❌ no $subject/ in the repository — nothing was scanned."
    exit 1
  fi
done

# Baseline: the merge-base with origin/master → report only NEW findings.
BASELINE=""
if git rev-parse --verify origin/master >/dev/null 2>&1; then
  BASELINE="$(git merge-base origin/master HEAD 2>/dev/null || echo "")"
fi

# When the merge-base IS HEAD — sitting on master with nothing unpushed — there
# is no branch delta, so there is nothing this scan is scoped to check. Say so
# and stop, rather than dropping the baseline and scanning everything: an
# unbaselined run reports every pre-existing finding as newly-introduced and
# exits 1, which is the "a legacy codebase drowns the hook" failure the scope
# note above rules out. It stops before semgrep is asked anything, so an empty
# delta fetches nothing.
#
# ⚠ `--baseline-commit HEAD` is NOT the fallback: semgrep's baseline diffs
# COMMITS, so with a dirty tree it scans 0 files and exits 0 — a check that
# reports success without looking at anything, which is worse than the noise it
# would replace. Measured, not assumed.
if [ -n "$BASELINE" ] && [ "$BASELINE" = "$(git rev-parse HEAD)" ]; then
  echo "ℹ️  No branch delta against origin/master — nothing newly-introduced to scan."
  echo "    (This scan reports only what the current branch adds; run it from a"
  echo "     feature branch, or after committing, to see your changes checked.)"
  exit 0
fi

# semgrep itself, before any scan: `uvx` that cannot get the package exits 1
# (no solution, or offline without it in the cache) or 2 (no network), and
# exit 1 of a scan means findings. Asked here, that outcome never reads as
# findings.
set +e
version_output="$("${SEMGREP[@]}" --version 2>&1)"
version_exit=$?
set -e
version="$(printf '%s\n' "$version_output" | sed -n 's/^\([0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*\).*/\1/p' | head -n 1)"
if [ $version_exit -ne 0 ] || [ -z "$version" ]; then
  if [ "$STAGE" = "ci" ]; then
    echo "❌ semgrep could not be fetched (exit $version_exit) — nothing was scanned; this is not a finding."
    printf '%s\n' "$version_output" | tail -n 3
    exit 3
  fi
  echo "⚠️  semgrep could not be fetched (exit $version_exit) — skipping SAST diff scan."
  echo "    (Not a finding. CI runs it with a pinned version.)"
  exit 0
fi

if [ "$STAGE" != "ci" ]; then
  # The lower of the two, field by field as numbers: as strings, 1.99.0 sorts
  # above 1.178.0.
  lower="$(printf '%s\n%s\n' "$SEMGREP_FLOOR" "$version" |
    sort -t . -k 1,1n -k 2,2n -k 3,3n | head -n 1)"
  if [ "$lower" != "$SEMGREP_FLOOR" ]; then
    echo "❌ semgrep $version is below $SEMGREP_FLOOR, the version CI pins — the scan did NOT run."
    echo "   Upgrade with: brew upgrade semgrep   (or: uv tool upgrade semgrep)"
    exit 3
  fi
fi

# Our rules load at least one rule. `rules: []` scans with exit 0 and checks
# nothing, and the count of rules a scan ran is no sign either: a healthy set
# on a delta without code runs none. Counted on a fixture, offline:
# `semgrep --validate` would fetch a pack of lints from semgrep.dev.
fixture_dir="$(mktemp -d)"
trap 'rm -rf "$fixture_dir"' EXIT
printf 'export const fixture = 1;\n' > "$fixture_dir/fixture.ts"
set +e
count_json="$("${SEMGREP[@]}" scan --config .semgrep/ --metrics=off --json --time "$fixture_dir/fixture.ts" 2>/dev/null)"
count_exit=$?
set -e
rule_count="$(printf '%s' "$count_json" | node -e '
let text = "";
process.stdin.on("data", (chunk) => (text += chunk)).on("end", () => {
  try {
    console.log(JSON.parse(text).time?.rules?.length ?? "");
  } catch {
    console.log("");
  }
});')"
if [ $count_exit -ne 0 ] || [ -z "$rule_count" ]; then
  if [ "$STAGE" = "ci" ]; then
    echo "❌ semgrep could not count the rules of .semgrep/ (exit $count_exit) — nothing was scanned."
    exit 3
  fi
  echo "⚠️  semgrep could not count the rules of .semgrep/ (exit $count_exit) — skipping SAST diff scan."
  exit 0
fi
if [ "$rule_count" -lt 1 ]; then
  echo "❌ .semgrep/ loads no rule — a scan with it would check nothing."
  exit 1
fi

BASELINE_ARG=""
if [ -n "$BASELINE" ]; then
  BASELINE_ARG="--baseline-commit $BASELINE"
fi

# One scan of the diff with one rule set; its exit code is the answer.
#
# ⚠ TWO `--include`s, and the second is not redundant: `shared/` sources live at
# `shared/<area>/*.ts` with no `src/` segment, so `**/src/**` alone filtered out
# the entire directory while `TARGETS` still listed it — a scan reporting "no
# findings" over code it never opened.
scan() {
  set +e
  # BASELINE_ARG and TARGETS are intentionally word-split into separate arguments.
  # shellcheck disable=SC2086
  "${SEMGREP[@]}" scan \
    --config "$1" \
    --include '**/src/**' \
    --include 'shared/**' \
    $BASELINE_ARG \
    --error --quiet \
    $TARGETS
  scan_exit=$?
  set -e
}

found=0

scan .semgrep/
if [ $scan_exit -eq 1 ]; then
  found=1
elif [ $scan_exit -ge 2 ]; then
  if [ "$STAGE" = "ci" ]; then
    echo "❌ semgrep errored on our rules, .semgrep/ (exit $scan_exit) — they did NOT run."
    exit 3
  fi
  echo "⚠️  semgrep errored on our rules (exit $scan_exit — likely setup); not blocking the push."
fi
ours_exit=$scan_exit

scan p/javascript
if [ $scan_exit -eq 1 ]; then
  found=1
elif [ $scan_exit -ge 2 ]; then
  if [ "$STAGE" = "ci" ]; then
    echo "::warning::semgrep p/javascript errored (exit $scan_exit, likely the network) — the registry rules did not run; ours did."
  else
    echo "⚠️  semgrep p/javascript errored (exit $scan_exit — likely network); not blocking the push."
  fi
fi

if [ $found -eq 1 ]; then
  echo ""
  echo "❌ Semgrep found newly-introduced issue(s). Triage:"
  echo "   1. Fix the flagged code (preferred)."
  echo "   2. If a confirmed false positive, add '// nosemgrep: <rule-id>' on the line."
  exit 1
fi

# Under --quiet a clean scan prints nothing, which reads the same as a scan that
# never ran. Only scans that ran clean reach this line.
if [ $ours_exit -ne 0 ] || [ $scan_exit -ne 0 ]; then
  exit 0
fi
if [ -n "$BASELINE" ]; then
  echo "✓ semgrep: no newly-introduced findings against $(git rev-parse --short "$BASELINE")"
else
  echo "✓ semgrep: no findings"
fi
exit 0
