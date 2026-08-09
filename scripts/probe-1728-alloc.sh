#!/usr/bin/env bash
# #1728 — name the allocation that crosses the `sysCount` step.
#
# THE QUESTION. Any edit adding two or more statements to `beginTransition`
# flips `navigate/sync-baseline` from 8.30 ms / `sysCount` 13 to 9.57 ms /
# `sysCount` 22, with `memoryAccess` moving hardest (+40.7 %) and `sysSeconds`
# not moving at all. +9 syscalls and no time in them is the signature of a
# process asking the OS for pages. This script asks WHICH pages.
#
# THE PAIR. FAST is the working tree as checked out — the ONE-statement form,
# measured at `sysCount` 13. SLOW is that same tree plus a single
# `probeSink = false;`, measured at 22. One line of diff, and the two land on
# opposite sides of the boundary: the tightest A/B this investigation has.
#
# ⚠ IT ONLY WORKS ON THE BOUNDARY BRANCH. The anchor is the probe statement
# that exists on `1728-probe-1-noop`, not on `master` (whose `beginTransition`
# is already past the boundary). Run from anywhere else and it says so and
# stops, rather than measuring a pair that is not the pair.
#
# ⚠ RUN IT ON THE RUNNER. The step does not reproduce on `arm64` / Darwin, and
# `strace` is Linux-only regardless. See `.github/workflows/perf-probe-1728.yml`.
#
# Usage:  bash scripts/probe-1728-alloc.sh [outdir]
#
# bash 3.2 compatible (macOS) — no associative arrays, no mapfile.
set -eu

ROOT=$(cd "$(dirname "$0")/.." && pwd)
OUT=${1:-"$ROOT/.probe-1728-alloc"}
TARGET=packages/core/src/namespaces/NavigationNamespace/transition/executeNavigation.ts
PROBE=tests/benchmarks/jit-probe-1728-alloc.ts

BATCH=${PROBE_BATCH:-512}
WARMUP=${PROBE_WARMUP_CALLS:-7}
WINDOWS=${PROBE_WINDOWS:-5}

cd "$ROOT"
mkdir -p "$OUT"

restore() { git checkout -q -- "$TARGET"; }
trap restore EXIT

# The flags CodSpeed's `simulation` mode ACTUALLY runs with. ⚠ `getV8Flags()`
# switches on `getInstrumentMode()`, and that maps `simulation` (and `memory`)
# onto `analysis` — so the full analysis set applies, `--no-opt` included.
# Measuring under any other set measures a different program.
CODSPEED_FLAGS="--interpreted-frames-native-stack --allow-natives-syntax \
  --hash-seed=1 --random-seed=1 --no-opt --predictable \
  --predictable-gc-schedule --expose-gc --no-concurrent-sweeping \
  --max-old-space-size=4096"

# ---------------------------------------------------------------------------
# The one-line difference between the two configurations.
# ---------------------------------------------------------------------------
apply_slow_config() {
  python3 - "$TARGET" <<'PY'
import pathlib, sys

p = pathlib.Path(sys.argv[1])
s = p.read_text(encoding="utf-8")

old = "  probeSink = true;\n"
new = "  probeSink = true;\n  probeSink = false;\n"

if old not in s:
    raise SystemExit(
        "anchor `probeSink = true;` missing — this script measures the 1-statement\n"
        "form against the 2-statement one, and that anchor exists only on the\n"
        "boundary branch. Check out `1728-probe-1-noop` (merged with the tooling\n"
        "from master) and run again."
    )

p.write_text(s.replace(old, new, 1), encoding="utf-8")
PY
}

STATEMENTS=$(grep -c 'probeSink = ' "$TARGET" || true)

if [ "$STATEMENTS" != "1" ]; then
  echo "ERROR: expected EXACTLY ONE 'probeSink = …' statement in beginTransition" >&2
  echo "       (the FAST form, measured at sysCount 13); found: $STATEMENTS." >&2
  echo "       This probe measures the 1-statement form against the 2-statement" >&2
  echo "       one, and that anchor lives on '1728-probe-1-noop' — master's" >&2
  echo "       beginTransition is already past the boundary." >&2
  exit 1
fi

run_node() {
  # $1 = output log, $2..= extra node flags before the script
  logfile=$1
  shift
  (
    cd packages/core
    node --conditions=@real-router/internal-source --import tsx \
      $CODSPEED_FLAGS "$@" "$PROBE" "$BATCH" "$WARMUP" "$WINDOWS"
  ) >"$logfile" 2>&1
}

# ---------------------------------------------------------------------------
# Window extraction. `strace -f` prefixes every line with a PID, so the markers
# are matched as substrings rather than anchored — and a line from a V8 helper
# thread landing between them is IN the window, which is correct: `sysCount`
# counts the process, not one thread.
# ---------------------------------------------------------------------------
window_of() {
  # $1 = strace log, $2 = window index
  awk -v w="$2" '
    index($0, "RR-1728-W" w "-BEGIN") { inside = 1; next }
    index($0, "RR-1728-W" w "-END")   { inside = 0 }
    inside                            { print }
  ' "$1"
}

summarise_window() {
  # $1 = strace log, $2 = window index
  n=$(window_of "$1" "$2" | wc -l | tr -d ' ')
  echo "    window $2 : $n syscalls"

  if [ "$n" = "0" ]; then
    return
  fi

  window_of "$1" "$2" |
    sed -E 's/^[0-9]+[[:space:]]+//' |
    sed -E 's/\(.*//' |
    sed -E 's/^[[:space:]]*//' |
    sort | uniq -c | sort -rn |
    sed 's/^/      /'
}

for cfg in FAST SLOW; do
  restore
  if [ "$cfg" = "SLOW" ]; then apply_slow_config; fi

  echo "=============== $cfg ==============="
  echo "  statements in beginTransition: $(grep -c 'probeSink = ' "$TARGET")"

  # -- 1. Heap deltas + GC trace, no tracer attached ------------------------
  # ⚠ This run is the reference: `strace` perturbs nothing about WHICH
  # syscalls happen, but it does perturb timing, and V8 has wall-clock-driven
  # heuristics. The heap numbers are read from the untraced run.
  if ! run_node "$OUT/$cfg-gc.log" --trace-gc-nvp; then
    echo "  probe FAILED — see $OUT/$cfg-gc.log" >&2
    tail -30 "$OUT/$cfg-gc.log" >&2
    exit 1
  fi

  echo "  --- heap deltas per window (untraced run) ---"
  # `[window N]` and its indented continuation lines, nothing else — the
  # `--trace-gc-nvp` output shares this file and is orders of magnitude longer.
  awk '/^\[window /{ p = 1; print; next } /^\[/{ p = 0 } p' \
    "$OUT/$cfg-gc.log" | sed 's/^/  /' || true

  # ⚠ NOT "GC events inside the window". V8 writes `--trace-gc` through its own
  # C-level stream and the probe writes its markers through Node's, so their
  # INTERLEAVING in one redirected file is a buffering artefact, not evidence.
  # The whole-run totals are comparable between configurations; whether a
  # collection landed inside the measured batch is answered by `used` above and
  # by strace below, both of which are read at a point in the program rather
  # than at a point in a log.
  echo "  --- GC totals for the whole run (both configs run the same program) ---"
  echo "    scavenges    : $(grep -c 'type=scavenge' "$OUT/$cfg-gc.log" || true)"
  echo "    mark-compacts: $(grep -c 'type=mark-sweep-compact\|type=mark-compact' "$OUT/$cfg-gc.log" || true)"

  # -- 2. strace: the syscalls themselves ----------------------------------
  if ! command -v strace >/dev/null 2>&1; then
    echo "  --- strace: SKIPPED (not on PATH) ---"
    continue
  fi

  # No `-e trace=` filter on purpose: the step is +9 syscalls of an unknown
  # KIND, and filtering to `%memory` up front would answer only the question
  # already assumed. The window is ~512 navigations, so the volume is fine.
  if ! (
    cd packages/core
    strace -f -s 200 -o "$OUT/$cfg.strace" \
      node --conditions=@real-router/internal-source --import tsx \
      $CODSPEED_FLAGS "$PROBE" "$BATCH" "$WARMUP" "$WINDOWS"
  ) >"$OUT/$cfg-strace.log" 2>&1; then
    echo "  --- strace: FAILED — see $OUT/$cfg-strace.log ---"
    tail -20 "$OUT/$cfg-strace.log" >&2
    continue
  fi

  echo "  --- strace: syscalls inside each window ---"
  w=0
  while [ "$w" -lt "$WINDOWS" ]; do
    summarise_window "$OUT/$cfg.strace" "$w"
    w=$((w + 1))
  done

  # ⚑ The raw window 0, verbatim. The counts above say WHAT; only the
  # arguments say how big the mapping was and where it came from — and window 0
  # is the one whose history matches the plugin's measured call.
  echo "  --- strace: window 0 verbatim ---"
  window_of "$OUT/$cfg.strace" 0 | sed 's/^/      /'
done

restore

# ---------------------------------------------------------------------------
# The one comparison worth printing side by side.
# ---------------------------------------------------------------------------
if [ -f "$OUT/FAST.strace" ] && [ -f "$OUT/SLOW.strace" ]; then
  echo
  echo "=============== window 0: FAST vs SLOW ==============="
  diff -u \
    <(window_of "$OUT/FAST.strace" 0 | sed -E 's/^[0-9]+[[:space:]]+//' | sed -E 's/\(.*//') \
    <(window_of "$OUT/SLOW.strace" 0 | sed -E 's/^[0-9]+[[:space:]]+//' | sed -E 's/\(.*//') \
    || true
fi

echo
echo "logs: $OUT"
