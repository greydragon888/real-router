#!/usr/bin/env bash
set -euo pipefail

# ------------------------------------------------------------
# Script: add-package-paths.sh
# Purpose:
#   Add a header comment with the full file path
#   (relative to the repository root) to every TypeScript file
#   inside packages/*/src, if it's not already present.
#
# Example header inserted:
#   // packages/real-router/src/core/navigation.ts
#
# Notes:
#   - Safe for repeated runs (idempotent)
#   - Works in parallel using all available CPU cores
#   - Supports spaces and special characters in file names
#   - Modifies files in place (atomic write via mktemp + mv)
# ------------------------------------------------------------

# Detect number of CPU cores for parallel execution (Linux/macOS)
NPROCS=$(nproc 2>/dev/null || getconf _NPROCESSORS_ONLN 2>/dev/null || echo 1)

# Find all .ts / .tsx files in packages/*/src
# and process each file in parallel using xargs
# shellcheck disable=SC2016  # we intentionally use single quotes for the inner script
output=$(find packages/*/src -type f \( -name "*.ts" -o -name "*.tsx" \) -print0 \
  | xargs -0 -n 1 -P "$NPROCS" bash -c '
      file=$1
      # Read the first line of the file (may be empty)
      first_line=$(head -n 1 "$file" 2>/dev/null || true)

      # If the first line does NOT start with "// packages/", add the header
      if ! [[ "$first_line" =~ ^//\ packages/ ]]; then
          tmp=$(mktemp)
          # Write header with file path + blank line, then append original content
          { printf "// %s\n\n" "$file"; cat "$file"; } > "$tmp"
          mv "$tmp" "$file"
          echo "$file"
      fi
  ' _ )

# Print summary results
if [[ -n "$output" ]]; then
    # Print each modified file with a check mark
    while IFS= read -r line; do
        echo "✔ $line"
    done <<< "$output"
    # Print total number of modified files
    echo "Added: $(wc -l <<< "$output")"
else
    echo "Added: 0"
fi
