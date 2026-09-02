#!/usr/bin/env bash
# Bundle two sides of a comparison into standalone ESM, so each arm runs in its
# own process with exactly ONE copy of core loaded.
#
#   ./build.sh <left-ref> <right-ref>          e.g. ./build.sh master HEAD
#
# The working tree is NOT touched: each side is materialised with `git archive`
# into a scratch directory and bundled from there. A ref of `WORKTREE` uses the
# current working tree as-is.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
OUT="$HERE/out"
mkdir -p "$OUT"

materialise () {           # $1 = ref, $2 = destination
  if [ "$1" = "WORKTREE" ]; then
    echo "$ROOT"; return
  fi
  rm -rf "$2"; mkdir -p "$2"
  git -C "$ROOT" archive "$1" packages shared | tar -x -C "$2"
  echo "$2"
}

bundle () {                # $1 = source root (for the aliases), $2 = ABSOLUTE entry, $3 = outfile
  npx --prefix "$ROOT" esbuild "$2" \
    --bundle --format=esm --platform=node --log-level=error \
    --outfile="$3" \
    --alias:@real-router/ssr-utils="$1/packages/ssr-utils/src/index.ts" \
    --alias:@real-router/core="$1/packages/core/src/index.ts" \
    --alias:@real-router/core/api="$1/packages/core/src/api/index.ts" \
    --alias:@real-router/core/utils="$1/packages/core/src/utils.ts" \
    --alias:@real-router/core/validation="$1/packages/core/src/validation.ts" \
    --alias:@real-router/core/types="$1/packages/core/src/types/index.ts"
}

# ⚠ The entry is GENERATED into out/ with absolute specifiers, never copied into
# the source tree. The WORKTREE side is the repo itself, and writing an entry
# there leaves stray untracked files behind — which it did, once. Absolute paths
# also keep each side pointing at its OWN core: a relative entry resolved from
# the wrong root pulls in a second copy, the internals WeakMap stops matching,
# and every router fails with `Invalid router instance`.
prepare () {               # $1 = source root, $2 = side name
  sed "s#\./packages/#$1/packages/#g" "$HERE/entry-core.ts" \
    > "$OUT/$2-entry-core.ts"
  sed "s#\./packages/#$1/packages/#g" "$HERE/entry-plugins.ts" \
    > "$OUT/$2-entry-plugins.ts"
}

L="$(materialise "${1:-master}" "$OUT/left-src")";    prepare "$L" left
R="$(materialise "${2:-WORKTREE}" "$OUT/right-src")"; prepare "$R" right

bundle "$L" "$OUT/left-entry-core.ts"     "$OUT/left-core.mjs"
bundle "$L" "$OUT/left-entry-plugins.ts"  "$OUT/left-plugins.mjs"
bundle "$R" "$OUT/right-entry-core.ts"    "$OUT/right-core.mjs"
bundle "$R" "$OUT/right-entry-plugins.ts" "$OUT/right-plugins.mjs"

# A/A control side: a byte copy of LEFT, so `drive.mjs left right` can be
# preceded by `drive.mjs left leftA` to read the floor before reading the delta.
cp "$OUT/left-core.mjs"    "$OUT/leftA-core.mjs"
cp "$OUT/left-plugins.mjs" "$OUT/leftA-plugins.mjs"

echo "built into $OUT"
