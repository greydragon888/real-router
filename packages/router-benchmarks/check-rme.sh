#!/bin/bash

# RME Verification Script
# Queries .bench/{router}/*.json files using jq
# Reports tests with RME > 10% grouped by section
# Exit code: 0 if all pass, 1 if any fail

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BENCH_DIR="$(dirname "$SCRIPT_DIR")/.bench"

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Track if any tests failed
FAILED=0

# Check if .bench directory exists
if [ ! -d "$BENCH_DIR" ]; then
  echo -e "${YELLOW}No .bench directory found. Skipping RME check.${NC}"
  exit 0
fi

# Find all routers with benchmark data
ROUTERS=$(find "$BENCH_DIR" -mindepth 1 -maxdepth 1 -type d -exec basename {} \; | sort)

if [ -z "$ROUTERS" ]; then
  echo -e "${YELLOW}No benchmark data found in .bench directory.${NC}"
  exit 0
fi

# Process each router
for ROUTER in $ROUTERS; do
  ROUTER_DIR="$BENCH_DIR/$ROUTER"
  
  # Find all JSON files for this router
  JSON_FILES=$(find "$ROUTER_DIR" -maxdepth 1 -name "*.json" -type f | sort)
  
  if [ -z "$JSON_FILES" ]; then
    continue
  fi
  
  echo -e "${YELLOW}=== $ROUTER ===${NC}"
  
  # Track if this router has any unstable tests
  ROUTER_FAILED=0
  
  # Process each JSON file (section)
  while IFS= read -r JSON_FILE; do
    SECTION_NAME=$(basename "$JSON_FILE" .json)
    
    # Extract section number from filename (e.g., "01-navigation-basic" -> "01")
    SECTION_NUM=$(echo "$SECTION_NAME" | sed 's/^\([0-9]*\).*/\1/')
    
    # Query for tests with RME > 0.1 (10%)
    UNSTABLE_TESTS=$(jq '[.[] | select(.stats.rme > 0.1) | {name: .name, rme: .stats.rme}]' "$JSON_FILE")
    
    # Count unstable tests
    UNSTABLE_COUNT=$(echo "$UNSTABLE_TESTS" | jq 'length')
    
    if [ "$UNSTABLE_COUNT" -gt 0 ]; then
      ROUTER_FAILED=1
      FAILED=1
      
      echo -e "${RED}Section $SECTION_NUM ($SECTION_NAME): $UNSTABLE_COUNT unstable tests${NC}"
      
      # Print each unstable test
      echo "$UNSTABLE_TESTS" | jq -r '.[] | "  \(.name): RME=\(.rme | tostring)"' | while read -r line; do
        echo -e "${RED}$line${NC}"
      done
    else
      echo -e "${GREEN}Section $SECTION_NUM ($SECTION_NAME): OK${NC}"
    fi
  done <<< "$JSON_FILES"
  
  if [ "$ROUTER_FAILED" -eq 0 ]; then
    echo -e "${GREEN}$ROUTER: All tests stable${NC}"
  else
    echo -e "${RED}$ROUTER: Some tests unstable${NC}"
  fi
  
  echo ""
done

# Exit with appropriate code
if [ "$FAILED" -eq 0 ]; then
  echo -e "${GREEN}✓ All benchmarks stable (RME ≤ 10%)${NC}"
  exit 0
else
  echo -e "${RED}✗ Some benchmarks unstable (RME > 10%)${NC}"
  exit 1
fi
