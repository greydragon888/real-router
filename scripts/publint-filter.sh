#!/bin/bash
# Wrapper for publint that filters out FILE_NOT_PUBLISHED errors
# for the "development" export condition.
#
# The "development" condition points to ./src/index.ts which is
# intentionally excluded from the npm tarball (not in "files").
# It exists only for monorepo development (Vite/TypeScript resolve it
# locally via customConditions). See #418.

output=$(publint 2>&1)
exit_code=$?

# Filter out "development" FILE_NOT_PUBLISHED lines
filtered=$(echo "$output" | grep -v 'development is ./src.*not published')

# Check if any real errors remain (lines starting with a number + dot)
real_errors=$(echo "$filtered" | grep -E '^\d+\.')

if [ -n "$real_errors" ]; then
  echo "$filtered"
  exit 1
fi

# Print clean output (without error lines)
echo "$filtered" | grep -v '^Errors:$'
exit 0
