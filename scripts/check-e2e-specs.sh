#!/bin/bash

# Verify that every example with a playwright.config.ts has at least one e2e spec.
# Prevents shipping examples with empty e2e/ directories.
# Usage: ./scripts/check-e2e-specs.sh

set -e

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
done < <(find examples -name playwright.config.ts -not -path '*/node_modules/*' 2>/dev/null)

if [ "$errors" -gt 0 ]; then
  echo ""
  echo "Found $errors example(s) with playwright config but no e2e specs."
  exit 1
fi

echo "All e2e directories have specs."
