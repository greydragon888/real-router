#!/usr/bin/env bash
# #1728 — is the step REAL, or only visible to the simulator?
#
# CodSpeed reports `cpuTotal` from a valgrind MODEL (instructions + cache misses
# + memory accesses), not from a clock. Under it, two forms of `beginTransition`
# differing by 28 bytes of bytecode sit 15.5 % apart with no intermediate value
# in fifteen runs. This measures the same two forms by the WALL CLOCK, the way a
# user runs them: no valgrind, no `--no-opt`, real JIT.
#
# Measured locally on arm64/Darwin first: 605 vs 603 ns, i.e. nothing, against a
# 7 % A/A floor. This script exists to repeat that on x64/Linux, where the step
# was found — an arm64 negative cannot close an x64 question.
#
# Protocol (the part that matters): ALTERNATING processes, A/A floor first,
# medians. Two numbers from two consecutive runs are not a comparison.
set -eu

ROOT=$(cd "$(dirname "$0")/.." && pwd)
FAST_REF=${FAST_REF:-1728-probe-alloc-boundary}
SLOW_REF=${SLOW_REF:-master}
ITER=${NATIVE_ITER:-200000}
WARM=${NATIVE_WARM:-40000}
PAIRS=${NATIVE_PAIRS:-7}

cd "$ROOT"
trap 'git checkout -q -- packages/core/src 2>/dev/null || true' EXIT

build() { # $1 = ref, $2 = out tag
  git checkout -q "$1" -- packages/core/src
  npx esbuild packages/core/tests/benchmarks/jit-probe-1728.ts \
    --bundle --platform=node --format=cjs \
    --outfile="/tmp/nat-$2.cjs" --conditions=@real-router/internal-source 2>/dev/null
  git checkout -q -- packages/core/src
}

# The probe prints "… (N ns each)"; that is the number.
run() { node "$1" "$ITER" "$WARM" 2>/dev/null | grep -oE '[0-9]+ ns each' | grep -oE '^[0-9]+'; }

med() { tr ' ' '\n' <<<"$1" | grep -E '^[0-9]+$' | sort -n |
  awk '{a[NR]=$1} END{ if(NR%2) print a[(NR+1)/2]; else print int((a[NR/2]+a[NR/2+1])/2) }'; }

build "$FAST_REF" fast
build "$SLOW_REF" slow
echo "built: FAST=$FAST_REF SLOW=$SLOW_REF  ($ITER navigations, $PAIRS pairs)"

AA=""
for i in $(seq 1 3); do AA="$AA $(run /tmp/nat-fast.cjs) $(run /tmp/nat-fast.cjs)"; done
echo "A/A floor (fast vs fast):$AA"

F=""; S=""
for i in $(seq 1 "$PAIRS"); do
  f=$(run /tmp/nat-fast.cjs); s=$(run /tmp/nat-slow.cjs)
  F="$F $f"; S="$S $s"; echo "  pair $i: fast=$f slow=$s"
done

mf=$(med "$F"); ms=$(med "$S")
echo "medians: fast=$mf slow=$ms"
awk -v a="$mf" -v b="$ms" 'BEGIN{ printf "delta: %+.2f %% (slow vs fast)\n", (b-a)/a*100 }'
echo "⚠ Read against the A/A spread above — a delta inside it is not a signal."
