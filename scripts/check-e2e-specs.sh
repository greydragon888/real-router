#!/bin/bash

# Verify that every example with a playwright.config.ts has at least one e2e spec.
# Prevents shipping examples with empty e2e/ directories.
# Usage: ./scripts/check-e2e-specs.sh   (from any directory)

set -e

# The examples are this checkout's: found from the script's own location, never
# from the cwd (#2544). From a subdirectory there is no `examples/` to list.
cd "$(dirname "$0")/.."

# Listed before the loop, so that a failing `find` fails the run under `set -e`
# and an empty list can be refused: a run that checked nothing is not a pass.
configs="$(find examples -name playwright.config.ts -not -path '*/node_modules/*')"
if [ -z "$configs" ]; then
  echo "ERROR: no playwright.config.ts under examples/ — nothing was checked."
  exit 1
fi

errors=0

while IFS= read -r config; do
  dir=$(dirname "$config")
  e2e_dir="$dir/e2e"

  if [ ! -d "$e2e_dir" ]; then
    echo "ERROR: $dir has playwright.config.ts but no e2e/ directory"
    errors=$((errors + 1))
    continue
  fi

  spec_count=$(find "$e2e_dir" -name '*.spec.ts' 2>/dev/null | wc -l | tr -d ' ')

  if [ "$spec_count" -eq 0 ]; then
    echo "ERROR: $e2e_dir has 0 spec files"
    errors=$((errors + 1))
  fi
done <<<"$configs"

if [ "$errors" -gt 0 ]; then
  echo ""
  echo "Found $errors example(s) with playwright config but no e2e specs."
  exit 1
fi

echo "All e2e directories have specs."
