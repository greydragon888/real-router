#!/bin/bash
set -e

# =============================================================================
# Router5 vs Router6 Benchmark Comparison Script
# Optimized for macOS with Apple Silicon (M3 Pro)
# =============================================================================

# Require sudo upfront
if [ "$EUID" -ne 0 ]; then
    echo "This script requires sudo privileges. Please run with sudo."
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RESULTS_DIR="${SCRIPT_DIR}/.bench-results"
COOLDOWN=${COOLDOWN:-60}
ORIGINAL_USER="${SUDO_USER:-$USER}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Cleanup function - runs even on error
cleanup() {
    echo ""
    echo -e "${YELLOW}[Cleanup] Restoring system state...${NC}"

    # Re-enable screensaver/display sleep
    if [ -n "$CAFFEINATE_PID" ] && kill -0 "$CAFFEINATE_PID" 2>/dev/null; then
        kill "$CAFFEINATE_PID" 2>/dev/null || true
        echo -e "${GREEN}[Cleanup] Screensaver/sleep re-enabled${NC}"
    fi

    # Restore Spotlight indexing
    sudo mdutil -i on / >/dev/null 2>&1 || true
    echo -e "${GREEN}[Cleanup] Spotlight indexing restored${NC}"
}

# Set trap to ensure cleanup runs on exit, error, or interrupt
trap cleanup EXIT INT TERM

# -----------------------------------------------------------------------------
# Step 1: Check heavy processes
# -----------------------------------------------------------------------------
echo -e "${BLUE}=== Router Benchmark Comparison ===${NC}"
echo ""
echo -e "${YELLOW}[Step 1] Checking for heavy processes...${NC}"

HEAVY_PROCESSES=$(ps -Ao %cpu,comm -r | awk '$1 > 10 && !/webstorm/ && !/claude/ && !/WindowServer/ {print $2 " (" $1 "%)"}' | head -5)

if [ -n "$HEAVY_PROCESSES" ]; then
    echo -e "${RED}Warning: Heavy processes detected (>10% CPU):${NC}"
    echo "$HEAVY_PROCESSES"
    echo ""
    read -p "Continue anyway? (y/N) " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Aborted by user."
        exit 1
    fi
fi

# -----------------------------------------------------------------------------
# Step 2: System info
# -----------------------------------------------------------------------------
echo ""
echo -e "${YELLOW}[Step 2] System information${NC}"
CHIP=$(system_profiler SPHardwareDataType 2>/dev/null | grep "Chip" | awk -F': ' '{print $2}')
echo "  Chip: $CHIP"
echo "  Cooldown between routers: ${COOLDOWN}s"

# -----------------------------------------------------------------------------
# Step 3: Disable system distractions
# -----------------------------------------------------------------------------
echo ""
echo -e "${YELLOW}[Step 3] Disabling system distractions...${NC}"

# Disable screensaver and display sleep
caffeinate -dim &
CAFFEINATE_PID=$!
echo -e "${GREEN}Screensaver/sleep disabled (PID: $CAFFEINATE_PID)${NC}"

# Disable Spotlight indexing
sudo mdutil -i off / >/dev/null 2>&1
echo -e "${GREEN}Spotlight indexing disabled${NC}"

# -----------------------------------------------------------------------------
# Step 4: Prepare
# -----------------------------------------------------------------------------
echo ""
echo -e "${YELLOW}[Step 4] Preparing...${NC}"
mkdir -p "$RESULTS_DIR"
cd "$SCRIPT_DIR"

# Build router6
echo "Building router6..."
pnpm --filter router6 build >/dev/null 2>&1
echo -e "${GREEN}router6 built successfully${NC}"

# -----------------------------------------------------------------------------
# Step 5: Run benchmarks
# -----------------------------------------------------------------------------
echo ""
echo -e "${YELLOW}[Step 5] Running benchmarks...${NC}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# --- router5 ---
echo ""
echo -e "${BLUE}--- Testing router5 ---${NC}"
RESULT_FILE_R5="${RESULTS_DIR}/${TIMESTAMP}_router5.txt"
BENCH_ROUTER=router5 NODE_OPTIONS='--expose-gc --max-old-space-size=4096' \
    npx tsx modules/index.ts 2>&1 | tee "$RESULT_FILE_R5"

# --- Cooldown ---
echo ""
echo -e "${YELLOW}Cooling down ${COOLDOWN}s before router6...${NC}"
sleep $COOLDOWN

# --- router6 ---
echo ""
echo -e "${BLUE}--- Testing router6 ---${NC}"
RESULT_FILE_R6="${RESULTS_DIR}/${TIMESTAMP}_router6.txt"
BENCH_ROUTER=router6 NODE_OPTIONS='--expose-gc --max-old-space-size=4096' \
    npx tsx modules/index.ts 2>&1 | tee "$RESULT_FILE_R6"

# -----------------------------------------------------------------------------
# Step 6: Fix file ownership (since script runs as root)
# -----------------------------------------------------------------------------
echo ""
echo -e "${YELLOW}[Step 6] Fixing file ownership...${NC}"
chown -R "$ORIGINAL_USER" "$RESULTS_DIR"
echo -e "${GREEN}Ownership transferred to $ORIGINAL_USER${NC}"

# -----------------------------------------------------------------------------
# Step 7: Summary
# -----------------------------------------------------------------------------
echo ""
echo -e "${GREEN}=== Benchmark Complete ===${NC}"
echo "Results saved to: $RESULTS_DIR"
echo ""
echo "Files:"
echo "  $RESULT_FILE_R5"
echo "  $RESULT_FILE_R6"

echo ""
echo -e "${BLUE}To compare results:${NC}"
echo "  diff $RESULT_FILE_R5 $RESULT_FILE_R6"
