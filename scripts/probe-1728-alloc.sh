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
  echo "    scavenges     : $(grep -c ' gc=s ' "$OUT/$cfg-gc.log" || true)"
  echo "    mark-compacts : $(grep -c ' gc=mc ' "$OUT/$cfg-gc.log" || true)"
  # The semi-space the batch is allocating into — a `used` delta approaching
  # this is the shape that would put a scavenge inside the window.
  echo "    new_space_capacity (last): $(grep -oE 'new_space_capacity=[0-9]+' "$OUT/$cfg-gc.log" | tail -1 || true)"
  # ⚑ Every collection, with the timestamp V8 stamps it with. The probe's own
  # notes carry no such clock, so these are NOT correlated to the windows here
  # — they answer "did the two configurations collect a different number of
  # times, and at different points" without pretending to place them.
  echo "    timeline: $(grep -oE '^\[[^]]*\] +[0-9]+ ms: pause=[0-9.]+ mutator=[0-9.]+ gc=[a-z]+' "$OUT/$cfg-gc.log" |
    sed -E 's/^\[[^]]*\] +//; s/ms: pause=[0-9.]+ mutator=[0-9.]+ //' | tr '\n' ' ' || true)"

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

  # ⚑ WHOLE-RUN histogram, and it is not a consolation prize for an empty
  # window. If the measured batch makes no syscalls at all, the question moves
  # to whether the two configurations differ ANYWHERE — and the memory family
  # (`mmap` / `madvise` / `munmap` / `brk`) is the one the +40 % `memoryAccess`
  # column would have to come from.
  echo "  --- strace: whole-run histogram ---"
  sed -E 's/^[0-9]+ +//; s/\(.*//' "$OUT/$cfg.strace" |
    grep -vE '^(\+\+\+|---|<\.\.\.)' | sort | uniq -c | sort -rn |
    head -20 | sed 's/^/      /'
done

# ---------------------------------------------------------------------------
# `sysCount` WHERE CODSPEED READS IT.
#
# ⚑ THIS IS THE PHASE THAT CAN ANSWER, and the strace phase above is what
# establishes that it has to exist. Natively the measured batch makes ZERO
# syscalls in both configurations, and the whole-run memory families are
# identical (`mmap` 150/150, `madvise` 102/102, `brk` 57/57) — so no native
# allocation crosses any step, and the +9 is not a fact about the program's
# dealings with the kernel.
#
# It is a fact about the program under VALGRIND. `sysCount` is callgrind's own
# event, emitted by `--collect-systime=yes` — the very flag CodSpeed's
# `simulation` instrument runs with — and callgrind's guest executes ~50-100x
# slower with valgrind's own allocator underneath, which is a different world
# for V8's time-driven GC heuristics. So the question is asked here, in that
# world, and `callgrind_annotate` can additionally say which FUNCTION the
# syscalls are attributed to, which no strace can.
# ---------------------------------------------------------------------------
echo
echo "=============== sysCount under callgrind ==============="

if ! command -v valgrind >/dev/null 2>&1; then
  echo "  SKIPPED: valgrind not on PATH"
else
  for cfg in FAST SLOW; do
    restore
    if [ "$cfg" = "SLOW" ]; then apply_slow_config; fi

    # ONE window: the plugin measures one, and a second would only add heap
    # history the plugin's measured call never has.
    if ! (
      cd packages/core
      valgrind --tool=callgrind --collect-systime=yes --cache-sim=no \
        --callgrind-out-file="$OUT/$cfg.callgrind" \
        node --conditions=@real-router/internal-source --import tsx \
        $CODSPEED_FLAGS "$PROBE" "$BATCH" "$WARMUP" 1
    ) >"$OUT/$cfg-callgrind.log" 2>&1; then
      echo "  $cfg: callgrind run FAILED — see $OUT/$cfg-callgrind.log"
      tail -20 "$OUT/$cfg-callgrind.log" >&2
      continue
    fi

    events=$(grep -m1 '^events:' "$OUT/$cfg.callgrind" || true)
    echo "  $cfg: $events"

    # `summary:` carries the whole-run totals in the `events:` order. Field 1 is
    # the literal "summary:", so column N of the event list is field N+1.
    col=$(echo "$events" | sed 's/^events: //' | tr ' ' '\n' |
      grep -n '^sysCount$' | cut -d: -f1 || true)

    if [ -n "$col" ]; then
      echo "    sysCount (whole run): $(grep -m1 '^summary:' "$OUT/$cfg.callgrind" |
        awk -v c="$col" '{ print $(c + 1) }')"
    else
      echo "    sysCount column absent — does this valgrind support --collect-systime?"
    fi

    # WHERE the syscalls are. Sorting by sysCount is what makes this readable;
    # older annotators reject `--sort`, so fall back rather than lose the table.
    if command -v callgrind_annotate >/dev/null 2>&1; then
      callgrind_annotate --sort=sysCount "$OUT/$cfg.callgrind" \
        >"$OUT/$cfg-annotate.txt" 2>/dev/null ||
        callgrind_annotate "$OUT/$cfg.callgrind" >"$OUT/$cfg-annotate.txt" 2>&1 || true

      echo "    --- callgrind_annotate, top frames ---"
      sed -n '/file:function/,$p' "$OUT/$cfg-annotate.txt" | head -22 | sed 's/^/      /'
    fi
  done

  # -------------------------------------------------------------------------
  # WHO READS THE CLOCK — by SLOPE, which is the only way to ask it.
  #
  # `clock_gettime` is 69 % of `sysCount`, but most of that belongs to node's
  # startup and the tsx transform, which run once and dwarf everything. A single
  # profile therefore attributes the clock to whoever started the process. Two
  # runs differing ONLY in the number of measured windows cancel that constant:
  # a caller whose count grows with N is called PER NAVIGATION, and that is the
  # one the step is about.
  #
  # `--separate-callers=2` keeps two levels of caller context on each function,
  # so the annotation says who reached `clock_gettime` rather than only that it
  # was reached.
  # -------------------------------------------------------------------------
  echo
  echo "=============== who reads the clock (slope over windows) ==============="
  restore

  for n in 1 20; do
    if ! (
      cd packages/core
      valgrind --tool=callgrind --collect-systime=yes --cache-sim=no \
        --separate-callers=2 \
        --callgrind-out-file="$OUT/CLOCK-$n.callgrind" \
        node --conditions=@real-router/internal-source --import tsx \
        $CODSPEED_FLAGS "$PROBE" "$BATCH" "$WARMUP" "$n"
    ) >"$OUT/CLOCK-$n.log" 2>&1; then
      echo "  windows=$n: run FAILED — see $OUT/CLOCK-$n.log"
      continue
    fi

    if command -v callgrind_annotate >/dev/null 2>&1; then
      callgrind_annotate --sort=sysCount --threshold=99.9 \
        "$OUT/CLOCK-$n.callgrind" >"$OUT/CLOCK-$n-annotate.txt" 2>/dev/null ||
        callgrind_annotate "$OUT/CLOCK-$n.callgrind" \
          >"$OUT/CLOCK-$n-annotate.txt" 2>&1 || true
    fi

    echo "  windows=$n: sysCount total $(grep -m1 '^summary:' "$OUT/CLOCK-$n.callgrind" |
      awk '{ print $3 }')"
  done

  # Every frame mentioning the clock, at both N, side by side. A frame whose
  # count is IDENTICAL at N=1 and N=20 belongs to startup; one that grew by
  # ~19x the per-window cost is the caller worth naming.
  if [ -f "$OUT/CLOCK-1-annotate.txt" ] && [ -f "$OUT/CLOCK-20-annotate.txt" ]; then
    echo "  --- frames touching clock_gettime, N=1 then N=20 ---"
    for n in 1 20; do
      echo "    [windows=$n]"
      grep -i "clock_gettime\|clock_nanosleep" "$OUT/CLOCK-$n-annotate.txt" |
        head -12 | sed 's/^/      /'
    done
  fi
fi

restore

echo
echo "logs: $OUT"
