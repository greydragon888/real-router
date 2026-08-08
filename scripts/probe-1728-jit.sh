#!/usr/bin/env bash
# #1728 — run the JIT/allocation probe once per configuration and keep the logs.
#
# The single variable is where `buildTransitionMeta` takes the meta's three
# flags from: the navigation PLAN (shipped) or the caller's `opts` (the read
# site that measured 8.3 ms). Everything else is held fixed — the plan keeps all
# its slots and the entry keeps its reads — so the diff isolates the read site
# and nothing else.
#
# ⚠ Run this where the effect lives. On `arm64` / Darwin the two configurations
# are indistinguishable by every instrument here; the regression was recorded on
# the self-hosted `Linux X64` runner (see `.github/workflows/perf-probe-1728.yml`).
#
# Usage:  bash scripts/probe-1728-jit.sh [outdir]
#
# bash 3.2 compatible (macOS) — no associative arrays, no mapfile.
set -eu

ROOT=$(cd "$(dirname "$0")/.." && pwd)
OUT=${1:-"$ROOT/.probe-1728"}
TARGET=packages/core/src/namespaces/NavigationNamespace/transition/completeTransition.ts
ITER=${PROBE_ITERATIONS:-400000}
WARM=${PROBE_WARMUP:-80000}
# The perf run needs the loop to DOMINATE: node startup + the tsx transform
# cost roughly as much as 400 k navigations, and a constant that large would
# dilute the very delta being measured. 2 M puts the loop an order of
# magnitude above it, and the constant cancels between configurations anyway.
PERF_ITER=${PROBE_PERF_ITERATIONS:-2000000}

cd "$ROOT"
mkdir -p "$OUT"

restore() { git checkout -q -- "$TARGET"; }
trap restore EXIT

# Rewrites the three reads to come from `nav.opts` instead of `nav`.
apply_opts_config() {
  python3 - "$TARGET" <<'PY'
import pathlib, sys

p = pathlib.Path(sys.argv[1])
s = p.read_text(encoding="utf-8")

for flag in ("reload", "replace", "redirected"):
    old = "  if (nav.%s !== undefined) {\n    meta.%s = nav.%s;\n  }" % (flag, flag, flag)
    new = "  if (nav.opts.%s !== undefined) {\n    meta.%s = nav.opts.%s;\n  }" % (flag, flag, flag)
    if old not in s:
        raise SystemExit("anchor missing for %s — has completeTransition.ts moved on?" % flag)
    s = s.replace(old, new, 1)

p.write_text(s, encoding="utf-8")
PY
}

# The two flags CodSpeed ALWAYS injects, in every instrument mode
# (`@codspeed/core` `getV8Flags()`): the measured environment has them, so a
# probe without them is measuring something else. ⚠ `--no-opt` is NOT among
# them — it is added only in `analysis` mode, and this repo runs `simulation`,
# so the benchmarked code IS optimized and JIT-level explanations stay on the
# table.
CODSPEED_FLAGS="--interpreted-frames-native-stack --allow-natives-syntax"

run_one() {
  # $1 = tag, $2 = extra node flags
  (
    cd packages/core
    node \
      --conditions=@real-router/internal-source --import tsx \
      $CODSPEED_FLAGS $2 tests/benchmarks/jit-probe-1728.ts "$ITER" "$WARM"
  ) >"$OUT/$1.log" 2>&1 || {
    echo "probe FAILED for $1 — see $OUT/$1.log" >&2
    tail -20 "$OUT/$1.log" >&2
    exit 1
  }
}

for cfg in PLAN OPTS; do
  restore
  if [ "$cfg" = "OPTS" ]; then apply_opts_config; fi

  run_one "$cfg-trace" "--trace-opt --trace-deopt"
  run_one "$cfg-inline" "--trace-turbo-inlining"
  run_one "$cfg-gc" "--trace-gc"

  echo "=============== $cfg ==============="
  # ⚠ The tier is read off `completed compiling … (target X)`, NOT off the
  # `marking dependent code <Code X>` lines — those name the tier of code being
  # INVALIDATED and read backwards. And the iteration count has to be high
  # enough for the function to reach the top tier at all: at 100 k it stops at
  # MAGLEV, at 200 k+ it reaches TURBOFAN_JS. A comparison across tiers is not a
  # comparison.
  echo -n "  final tier of completeTransition : "
  grep -oE "completed compiling [^<]*<JSFunction completeTransition [^)]*\)> \(target [A-Z_]+\)" "$OUT/$cfg-trace.log" |
    grep -oE "target [A-Z_]+" | tail -1 | sed 's/target //' || echo "not optimized"
  for fn in completeTransition buildTransitionMeta executeNavigation; do
    echo "  deopts of $fn : $(grep -c "deoptimizing.*$fn" "$OUT/$cfg-trace.log" || true)"
  done
  echo "  inlined into completeTransition  : $(grep -c "Inlining .* into .*completeTransition" "$OUT/$cfg-inline.log" || true)"
  echo "  buildTransitionMeta inlined      : $(grep -c "Inlining .*buildTransitionMeta.* into .*completeTransition" "$OUT/$cfg-inline.log" || true)"
  echo "  scavenges / mark-compacts        : $(grep -c Scavenge "$OUT/$cfg-gc.log" || true) / $(grep -cE 'Mark-|Mark Compact' "$OUT/$cfg-gc.log" || true)"
  echo "  wall-clock (informative only)    : $(grep -oE '^\[probe\] [0-9.]+ ms' "$OUT/$cfg-gc.log" || echo n/a)"
done

# ---------------------------------------------------------------------------
# Retired instructions — the quantity CodSpeed's `simulation` mode actually
# reports. Wall-clock and instruction count are DIFFERENT numbers: 15 % more
# instructions that are individually cheaper is entirely consistent with a
# wall-clock that does not move, which is exactly the shape #1728 is chasing.
#
# Linux only, and it needs the kernel to permit user-space counting
# (`perf_event_paranoid <= 2`). Everything here degrades to a printed reason
# rather than a failure, so the script stays runnable on a developer machine.
# ---------------------------------------------------------------------------
echo
echo "=============== instructions (perf) ==============="

if ! command -v perf >/dev/null 2>&1; then
  echo "  skipped: perf not on PATH (expected on macOS; Linux runner should have it)"
elif [ ! -r /proc/sys/kernel/perf_event_paranoid ]; then
  echo "  skipped: /proc/sys/kernel/perf_event_paranoid unreadable — not Linux?"
else
  paranoid=$(cat /proc/sys/kernel/perf_event_paranoid)
  echo "  perf_event_paranoid = $paranoid (needs <= 2 for user-space counting)"

  if [ "$paranoid" -gt 2 ]; then
    echo "  skipped: kernel refuses user-space counting at this level"
  else
    for cfg in PLAN OPTS; do
      restore
      if [ "$cfg" = "OPTS" ]; then apply_opts_config; fi

      (
        cd packages/core
        perf stat -e instructions,cycles,task-clock -x, -o "$OUT/$cfg-perf.txt" -- \
          node --conditions=@real-router/internal-source --import tsx \
          $CODSPEED_FLAGS tests/benchmarks/jit-probe-1728.ts "$PERF_ITER" "$WARM"
      ) >"$OUT/$cfg-perf.log" 2>&1 || {
        echo "  $cfg: perf run failed — see $OUT/$cfg-perf.log"
        continue
      }

      ins=$(grep -E "^[0-9]+,+instructions" "$OUT/$cfg-perf.txt" | cut -d, -f1)
      cyc=$(grep -E "^[0-9]+,+cycles" "$OUT/$cfg-perf.txt" | cut -d, -f1)
      echo "  $cfg: instructions=${ins:-n/a}  cycles=${cyc:-n/a}  ($PERF_ITER navigations)"
    done
  fi
fi

echo
echo "logs: $OUT"
