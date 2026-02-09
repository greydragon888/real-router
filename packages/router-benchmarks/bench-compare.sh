#!/bin/bash
set -e

# =============================================================================
# Router5 vs Router6 vs Real-Router Benchmark Comparison Script
# Optimized for macOS with Apple Silicon (M3 Pro)
# =============================================================================

# Require bash (not sh, dash, zsh, etc.)
# Using POSIX-compatible syntax here so the error message works even when run with sh
if [ -z "$BASH_VERSION" ]; then
    echo "Error: This script requires bash. Please run with:"
    echo "  sudo bash $0"
    echo "  or"
    echo "  sudo ./$0"
    exit 1
fi

# Show help (before sudo check so users can see help without sudo)
for arg in "$@"; do
    if [[ "$arg" == "-h" || "$arg" == "--help" ]]; then
        echo "Usage: sudo ./bench-compare.sh [SECTIONS...]"
        echo ""
        echo "Run benchmark comparison between router5, router6, and real-router."
        echo ""
        echo "Arguments:"
        echo "  SECTIONS    Section numbers to run (space-separated). If omitted, runs all."
        echo ""
        echo "Available sections:"
        echo "   1  Navigation Basic"
        echo "   2  Navigation Plugins"
        echo "   3  Dependencies"
        echo "   4  Plugins Management"
        echo "   7  Path Operations"
        echo "   8  Current State"
        echo "   9  Redirects"
        echo "  11  Events"
        echo "  12  Stress Testing"
        echo "  13  Cloning"
        echo ""
        echo "Examples:"
        echo "  sudo ./bench-compare.sh           # Run all sections"
        echo "  sudo ./bench-compare.sh 1         # Run only Navigation Basic"
        echo "  sudo ./bench-compare.sh 1 2 3     # Run sections 1, 2, and 3"
        echo ""
        echo "Environment variables:"
        echo "  SHORT_COOLDOWN     Cooldown between routers within a section (default: 20)"
        echo "  COOLDOWN           Fallback cooldown when thermal pressure unavailable (default: 60)"
        echo "  MAX_COOLDOWN_WAIT  Max thermal cooldown wait between sections (default: 300)"
        echo ""
        echo "Benchmark methodology:"
        echo "  Runs each section for ALL routers before moving to next section."
        echo "  This ensures fair comparisons within each section (similar thermal state)."
        exit 0
    fi
done

# Require sudo upfront
if [[ "$EUID" -ne 0 ]]; then
    echo "This script requires sudo privileges. Please run with sudo."
    exit 1
fi

# Parse section arguments
BENCH_SECTIONS=""
for arg in "$@"; do
    # Collect section numbers (skip flags)
    if [[ "$arg" =~ ^[0-9]+$ ]]; then
        if [[ -n "$BENCH_SECTIONS" ]]; then
            BENCH_SECTIONS="${BENCH_SECTIONS},${arg}"
        else
            BENCH_SECTIONS="$arg"
        fi
    fi
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RESULTS_DIR="${SCRIPT_DIR}/.bench-results"
COOLDOWN=${COOLDOWN:-60}
MAX_COOLDOWN_WAIT=${MAX_COOLDOWN_WAIT:-300}
ORIGINAL_USER="${SUDO_USER:-$USER}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Smart cooldown - waits for CPU temperature to drop
# Falls back to fixed cooldown if temperature cannot be read
# Supports both Intel ("CPU die temperature") and Apple Silicon ("Die temperature")
# Get thermal pressure level (Apple Silicon)
# Returns: Nominal, Moderate, Heavy, Trapping, or Critical
get_thermal_pressure() {
    local output
    output=$(sudo powermetrics --samplers thermal -i 1 -n 1 2>/dev/null)
    echo "$output" | grep -i "pressure level" | awk -F': ' '{print $2}' | tr -d ' '
}

# Check for thermal throttling
# Returns 0 if throttling detected, 1 if not
check_throttling() {
    local pressure
    pressure=$(get_thermal_pressure)

    if [[ -z "$pressure" ]]; then
        return 1  # Cannot detect, assume OK
    fi

    # Nominal = OK, anything else = potential throttling
    if [[ "$pressure" != "Nominal" ]]; then
        return 0  # Throttling detected
    fi

    return 1  # No throttling
}

warn_if_throttling() {
    local pressure
    pressure=$(get_thermal_pressure)

    if [[ -z "$pressure" ]]; then
        return 1
    fi

    if [[ "$pressure" != "Nominal" ]]; then
        echo -e "${RED}⚠️  WARNING: Thermal pressure is $pressure (not Nominal)${NC}"
        echo -e "${RED}   Benchmark results may be unreliable.${NC}"
        return 0
    fi
    return 1
}

wait_for_cooldown() {
    local max_wait=${1:-300}  # Max 5 minutes
    local elapsed=0

    echo -e "${YELLOW}Waiting for thermal pressure to become Nominal (max: ${max_wait}s)...${NC}"

    # First check if we can read thermal pressure at all
    local initial_pressure
    initial_pressure=$(get_thermal_pressure)

    if [[ -z "$initial_pressure" ]]; then
        echo -e "${YELLOW}Cannot read thermal pressure, using fixed cooldown (${COOLDOWN}s)${NC}"
        sleep "$COOLDOWN"
        return 0
    fi

    # If already Nominal, just do a short cooldown
    if [[ "$initial_pressure" == "Nominal" ]]; then
        echo -e "${GREEN}Thermal pressure already Nominal, short cooldown (30s)${NC}"
        sleep 30
        return 0
    fi

    while (( elapsed < max_wait )); do
        local pressure
        pressure=$(get_thermal_pressure)

        echo -ne "\r  Thermal pressure: $pressure (elapsed: ${elapsed}s)    "

        if [[ "$pressure" == "Nominal" ]]; then
            echo ""
            echo -e "${GREEN}Thermal pressure is Nominal, ready${NC}"
            return 0
        fi

        sleep 10
        elapsed=$((elapsed + 10))
    done

    echo ""
    echo -e "${YELLOW}Max wait time reached, continuing anyway (pressure: $pressure)${NC}"
    return 0
}

# Cleanup function - runs even on error
cleanup() {
    echo ""
    echo -e "${YELLOW}[Cleanup] Restoring system state...${NC}"

    # Re-enable screensaver/display sleep
    if [[ -n "$CAFFEINATE_PID" ]] && kill -0 "$CAFFEINATE_PID" 2>/dev/null; then
        kill "$CAFFEINATE_PID" 2>/dev/null || true
        echo -e "${GREEN}[Cleanup] Screensaver/sleep re-enabled${NC}"
    fi

    # Restore Spotlight indexing
    sudo mdutil -i on / >/dev/null 2>&1 || true
    echo -e "${GREEN}[Cleanup] Spotlight indexing restored${NC}"

    # Restore Time Machine
    sudo tmutil enable >/dev/null 2>&1 || true
    echo -e "${GREEN}[Cleanup] Time Machine restored${NC}"
}

# Set trap to ensure cleanup runs on exit, error, or interrupt
trap cleanup EXIT INT TERM

# -----------------------------------------------------------------------------
# Step 1: Check heavy processes and applications
# -----------------------------------------------------------------------------
echo -e "${BLUE}=== Router Benchmark Comparison ===${NC}"
echo ""
echo -e "${YELLOW}[Step 1] Checking system state...${NC}"

# Check power status
POWER_SOURCE=$(pmset -g batt 2>/dev/null | head -1 | grep -o "'.*'" | tr -d "'")
BATTERY_PERCENT=$(pmset -g batt 2>/dev/null | grep -o '[0-9]\+%' | tr -d '%')

if [[ "$POWER_SOURCE" != "AC Power" ]]; then
    echo -e "${RED}⚠️  WARNING: Running on battery power${NC}"
    if [[ -n "$BATTERY_PERCENT" ]]; then
        echo -e "${RED}   Battery level: ${BATTERY_PERCENT}%${NC}"
    fi
    echo -e "${RED}   Connect to power adapter for stable benchmark results.${NC}"
    echo -e "${RED}   CPU may throttle on battery to save power.${NC}"
    POWER_WARNING=1
else
    echo -e "${GREEN}Running on AC Power${NC}"
    POWER_WARNING=0
fi

# Check for running applications that may affect benchmark stability
DISTRACTING_APPS=""
pgrep -q "Google Chrome" && DISTRACTING_APPS="${DISTRACTING_APPS}  - Google Chrome\n"
pgrep -q "Telegram" && DISTRACTING_APPS="${DISTRACTING_APPS}  - Telegram\n"
pgrep -q "webstorm" && DISTRACTING_APPS="${DISTRACTING_APPS}  - WebStorm\n"
pgrep -q "Slack" && DISTRACTING_APPS="${DISTRACTING_APPS}  - Slack\n"
pgrep -q "Discord" && DISTRACTING_APPS="${DISTRACTING_APPS}  - Discord\n"
pgrep -q "Spotify" && DISTRACTING_APPS="${DISTRACTING_APPS}  - Spotify\n"

if [[ -n "$DISTRACTING_APPS" ]]; then
    echo -e "${YELLOW}Warning: The following apps may affect benchmark stability:${NC}"
    echo -e "$DISTRACTING_APPS"
fi

# Check for heavy CPU processes
HEAVY_PROCESSES=$(ps -Ao %cpu,comm -r | awk '$1 > 10 && !/webstorm/ && !/claude/ && !/WindowServer/ {print $2 " (" $1 "%)"}' | head -5)

if [[ -n "$HEAVY_PROCESSES" ]]; then
    echo -e "${RED}Warning: Heavy processes detected (>10% CPU):${NC}"
    echo "$HEAVY_PROCESSES"
fi

# Prompt if any warnings
if [[ -n "$DISTRACTING_APPS" || -n "$HEAVY_PROCESSES" || "$POWER_WARNING" -eq 1 ]]; then
    echo ""
    read -p "Continue anyway? (y/N) " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Aborted by user."
        exit 1
    fi
else
    echo -e "${GREEN}System state OK (AC power, no distracting apps or heavy processes)${NC}"
fi

# -----------------------------------------------------------------------------
# Step 2: System info
# -----------------------------------------------------------------------------
echo ""
echo -e "${YELLOW}[Step 2] System information${NC}"
CHIP=$(system_profiler SPHardwareDataType 2>/dev/null | grep "Chip" | awk -F': ' '{print $2}')
THERMAL_PRESSURE=$(get_thermal_pressure)
echo "  Chip: $CHIP"
echo "  Power: ${POWER_SOURCE:-unknown}${BATTERY_PERCENT:+ (${BATTERY_PERCENT}%)}"
echo "  Thermal pressure: ${THERMAL_PRESSURE:-unknown}"
echo "  Cooldown: wait for Nominal (max ${MAX_COOLDOWN_WAIT}s, fallback ${COOLDOWN}s)"
echo "  Short cooldown: ${SHORT_COOLDOWN:-20}s between routers"
echo "  Sections: ${BENCH_SECTIONS:-all}"
echo "  Mode: per-section isolated runs (all routers per section)"

# -----------------------------------------------------------------------------
# Step 3: Disable system distractions
# -----------------------------------------------------------------------------
echo ""
echo -e "${YELLOW}[Step 3] Disabling system distractions...${NC}"

# Disable screensaver and display sleep
caffeinate -dim &
CAFFEINATE_PID=$!
echo -e "${GREEN}Screensaver/sleep disabled (PID: $CAFFEINATE_PID)${NC}"

# Disable Spotlight indexing (non-fatal if fails)
sudo mdutil -i off / >/dev/null 2>&1 || true
echo -e "${GREEN}Spotlight indexing disabled${NC}"

# Disable Time Machine backups (non-fatal if not configured)
sudo tmutil disable >/dev/null 2>&1 || true
echo -e "${GREEN}Time Machine disabled${NC}"

# Flush file system caches (purge may fail on some systems)
sync && sudo purge || true || true
echo -e "${GREEN}File system caches purged${NC}"

# -----------------------------------------------------------------------------
# Step 4: Prepare
# -----------------------------------------------------------------------------
echo ""
echo -e "${YELLOW}[Step 4] Preparing...${NC}"
mkdir -p "$RESULTS_DIR"
cd "$SCRIPT_DIR"

# Build real-router
echo "Building @real-router/core..."
pnpm --filter @real-router/core build >/dev/null 2>&1
echo -e "${GREEN}@real-router/core built successfully${NC}"

# -----------------------------------------------------------------------------
# Step 5: Run benchmarks (per-section isolated runs)
# -----------------------------------------------------------------------------
echo ""
echo -e "${YELLOW}[Step 5] Running benchmarks (per-section isolated runs)...${NC}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Check for throttling before starting
if warn_if_throttling; then
    read -p "Continue anyway? (y/N) " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Aborted by user."
        exit 1
    fi
fi

# Define available sections (no section 6)
AVAILABLE_SECTIONS=(1 2 3 4 5 7 8 9 11 12 13)

# Parse requested sections or use all
if [[ -n "$BENCH_SECTIONS" ]]; then
    IFS=',' read -ra RUN_SECTIONS <<< "$BENCH_SECTIONS"
else
    RUN_SECTIONS=("${AVAILABLE_SECTIONS[@]}")
fi

echo -e "${CYAN}Running sections: ${RUN_SECTIONS[*]}${NC}"
echo -e "${CYAN}Mode: per-section isolated runs (all routers per section)${NC}"

# Short cooldown between routers within a section (seconds)
SHORT_COOLDOWN=${SHORT_COOLDOWN:-20}
echo -e "${CYAN}Short cooldown between routers: ${SHORT_COOLDOWN}s${NC}"

# Initialize result files (empty them)
RESULT_FILE_ROUTER5="${RESULTS_DIR}/${TIMESTAMP}_router5.txt"
RESULT_FILE_ROUTER6="${RESULTS_DIR}/${TIMESTAMP}_router6.txt"
RESULT_FILE_REAL_ROUTER="${RESULTS_DIR}/${TIMESTAMP}_real-router.txt"
RESULT_FILE_REAL_ROUTER_NOVALIDATE="${RESULTS_DIR}/${TIMESTAMP}_real-router-novalidate.txt"

: > "$RESULT_FILE_ROUTER5"
: > "$RESULT_FILE_ROUTER6"
: > "$RESULT_FILE_REAL_ROUTER"
: > "$RESULT_FILE_REAL_ROUTER_NOVALIDATE"

# Run each section for all routers before moving to the next section
# This ensures fair comparison within each section (similar thermal conditions)
for section in "${RUN_SECTIONS[@]}"; do
    echo ""
    echo -e "${CYAN}╔════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║  Section $section                             ║${NC}"
    echo -e "${CYAN}╚════════════════════════════════════════╝${NC}"

    # --- router5 ---
    echo -e "${BLUE}  [1/4] router5 (section $section)...${NC}"
    sync && sudo purge || true
    BENCH_ROUTER=router5 BENCH_SECTIONS="$section" NODE_OPTIONS='--expose-gc --max-old-space-size=4096' \
        nice -n -20 npx tsx src/index.ts 2>&1 | tee -a "$RESULT_FILE_ROUTER5"
    echo -e "${GREEN}  ✓ router5 done, cooling down ${SHORT_COOLDOWN}s...${NC}"
    sleep "$SHORT_COOLDOWN"

    # --- router6 ---
    echo -e "${BLUE}  [2/4] router6 (section $section)...${NC}"
    sync && sudo purge || true
    BENCH_ROUTER=router6 BENCH_SECTIONS="$section" NODE_OPTIONS='--expose-gc --max-old-space-size=4096' \
        nice -n -20 npx tsx src/index.ts 2>&1 | tee -a "$RESULT_FILE_ROUTER6"
    echo -e "${GREEN}  ✓ router6 done, cooling down ${SHORT_COOLDOWN}s...${NC}"
    sleep "$SHORT_COOLDOWN"

    # --- real-router ---
    echo -e "${BLUE}  [3/4] real-router (section $section)...${NC}"
    sync && sudo purge || true
    BENCH_ROUTER=real-router BENCH_SECTIONS="$section" NODE_OPTIONS='--expose-gc --max-old-space-size=4096' \
        nice -n -20 npx tsx src/index.ts 2>&1 | tee -a "$RESULT_FILE_REAL_ROUTER"
    echo -e "${GREEN}  ✓ real-router done, cooling down ${SHORT_COOLDOWN}s...${NC}"
    sleep "$SHORT_COOLDOWN"

    # --- real-router (noValidate) ---
    echo -e "${BLUE}  [4/4] real-router noValidate (section $section)...${NC}"
    sync && sudo purge || true
    BENCH_ROUTER=real-router BENCH_NO_VALIDATE=true BENCH_SECTIONS="$section" NODE_OPTIONS='--expose-gc --max-old-space-size=4096' \
        nice -n -20 npx tsx src/index.ts 2>&1 | tee -a "$RESULT_FILE_REAL_ROUTER_NOVALIDATE"
    echo -e "${GREEN}  ✓ real-router (noValidate) done${NC}"

    # Thermal cooldown between sections (not after the last one)
    # Note: ${RUN_SECTIONS[-1]} syntax requires bash 4.0+, but macOS ships with bash 3.2
    LAST_SECTION="${RUN_SECTIONS[${#RUN_SECTIONS[@]}-1]}"
    if [[ "$section" != "$LAST_SECTION" ]]; then
        echo ""
        echo -e "${YELLOW}Section $section complete. Waiting for thermal cooldown...${NC}"
        wait_for_cooldown "$MAX_COOLDOWN_WAIT"
    fi
done

echo ""
echo -e "${GREEN}All sections complete!${NC}"

# -----------------------------------------------------------------------------
# Step 6: Fix file ownership (since script runs as root)
# -----------------------------------------------------------------------------
echo ""
echo -e "${YELLOW}[Step 6] Fixing file ownership...${NC}"
chown -R "$ORIGINAL_USER" "$RESULTS_DIR"
echo -e "${GREEN}Ownership transferred to $ORIGINAL_USER${NC}"

# -----------------------------------------------------------------------------
# Step 7: Run comparison
# -----------------------------------------------------------------------------
echo ""
echo -e "${YELLOW}[Step 7] Running comparison...${NC}"
# Run as original user to avoid permission issues with output file
sudo -u "$ORIGINAL_USER" node compare.mjs

# -----------------------------------------------------------------------------
# Step 8: Summary
# -----------------------------------------------------------------------------
echo ""
echo -e "${GREEN}=== Benchmark Complete ===${NC}"
echo "Results saved to: $RESULTS_DIR"
echo ""
echo "Files:"
echo "  router5 (baseline): $RESULT_FILE_ROUTER5"
echo "  router6: $RESULT_FILE_ROUTER6"
echo "  real-router (current): $RESULT_FILE_REAL_ROUTER"
echo "  real-router (noValidate): $RESULT_FILE_REAL_ROUTER_NOVALIDATE"
echo "  comparison: ${RESULTS_DIR}/${TIMESTAMP}_comparison.txt"
