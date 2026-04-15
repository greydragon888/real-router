#!/bin/bash
set -e

# =============================================================================
# TanStack Router vs Real-Router Benchmark Comparison Script
# Optimized for macOS with Apple Silicon (M3 Pro)
# =============================================================================

# Require bash (not sh, dash, zsh, etc.)
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
        echo "Usage: sudo ./bench-compare-vs-tanstack.sh"
        echo ""
        echo "Run vs-tanstack benchmark comparison between TanStack Router and Real-Router."
        echo "Both routers render a React app in JSDOM and perform 10-step navigation loops."
        echo ""
        echo "Environment variables:"
        echo "  SHORT_COOLDOWN     Cooldown between routers (default: 20)"
        echo "  COOLDOWN           Fallback cooldown when thermal pressure unavailable (default: 60)"
        echo "  MAX_COOLDOWN_WAIT  Max thermal cooldown wait (default: 300)"
        echo ""
        echo "Benchmark methodology:"
        echo "  1. Pre-build both apps via Vite (production mode, no minification)"
        echo "  2. Run TanStack Router benchmark (vitest bench, NODE_ENV=production)"
        echo "  3. Cooldown"
        echo "  4. Run Real-Router benchmark (vitest bench, NODE_ENV=production)"
        echo "  5. Display results"
        exit 0
    fi
done

# Require sudo upfront
if [[ "$EUID" -ne 0 ]]; then
    echo "This script requires sudo privileges. Please run with sudo."
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RESULTS_DIR="${SCRIPT_DIR}/vs-tanstack/.bench-results"
COOLDOWN=${COOLDOWN:-60}
SHORT_COOLDOWN=${SHORT_COOLDOWN:-20}
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
get_thermal_pressure() {
    local output
    output=$(sudo powermetrics --samplers thermal -i 1 -n 1 2>/dev/null)
    echo "$output" | grep -i "pressure level" | awk -F': ' '{print $2}' | tr -d ' '
}

check_throttling() {
    local pressure
    pressure=$(get_thermal_pressure)
    if [[ -z "$pressure" ]]; then
        return 1
    fi
    if [[ "$pressure" != "Nominal" ]]; then
        return 0
    fi
    return 1
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
    local max_wait=${1:-300}
    local elapsed=0

    echo -e "${YELLOW}Waiting for thermal pressure to become Nominal (max: ${max_wait}s)...${NC}"

    local initial_pressure
    initial_pressure=$(get_thermal_pressure)

    if [[ -z "$initial_pressure" ]]; then
        echo -e "${YELLOW}Cannot read thermal pressure, using fixed cooldown (${COOLDOWN}s)${NC}"
        sleep "$COOLDOWN"
        return 0
    fi

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

    if [[ -n "$CAFFEINATE_PID" ]] && kill -0 "$CAFFEINATE_PID" 2>/dev/null; then
        kill "$CAFFEINATE_PID" 2>/dev/null || true
        echo -e "${GREEN}[Cleanup] Screensaver/sleep re-enabled${NC}"
    fi

    sudo mdutil -i on / >/dev/null 2>&1 || true
    echo -e "${GREEN}[Cleanup] Spotlight indexing restored${NC}"

    sudo tmutil enable >/dev/null 2>&1 || true
    echo -e "${GREEN}[Cleanup] Time Machine restored${NC}"
}

trap cleanup EXIT INT TERM

# -----------------------------------------------------------------------------
# Step 1: Check heavy processes and applications
# -----------------------------------------------------------------------------
echo -e "${BLUE}=== Client-Nav Benchmark Comparison ===${NC}"
echo -e "${BLUE}=== TanStack Router vs Real-Router (React) ===${NC}"
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
echo "  Short cooldown: ${SHORT_COOLDOWN}s between routers"
echo "  Runners: TanStack Router, Real-Router (React, vitest bench)"

# -----------------------------------------------------------------------------
# Step 3: Disable system distractions
# -----------------------------------------------------------------------------
echo ""
echo -e "${YELLOW}[Step 3] Disabling system distractions...${NC}"

caffeinate -dim &
CAFFEINATE_PID=$!
echo -e "${GREEN}Screensaver/sleep disabled (PID: $CAFFEINATE_PID)${NC}"

sudo mdutil -i off / >/dev/null 2>&1 || true
echo -e "${GREEN}Spotlight indexing disabled${NC}"

sudo tmutil disable >/dev/null 2>&1 || true
echo -e "${GREEN}Time Machine disabled${NC}"

sync && sudo purge || true
echo -e "${GREEN}File system caches purged${NC}"

# -----------------------------------------------------------------------------
# Step 4: Build both apps
# -----------------------------------------------------------------------------
echo ""
echo -e "${YELLOW}[Step 4] Building benchmark apps...${NC}"
mkdir -p "$RESULTS_DIR"
cd "$SCRIPT_DIR"

# Build real-router core and dependencies first
echo "Building @real-router/core and dependencies..."
pnpm --filter @real-router/core... build >/dev/null 2>&1
echo -e "${GREEN}@real-router/core and dependencies built successfully${NC}"

# Build TanStack app
echo "Building TanStack Router benchmark app..."
pnpm bench:vs-tanstack:build:tanstack >/dev/null 2>&1
echo -e "${GREEN}TanStack Router app built${NC}"

# Build Real-Router app
echo "Building Real-Router benchmark app..."
pnpm bench:vs-tanstack:build:real-router >/dev/null 2>&1
echo -e "${GREEN}Real-Router app built${NC}"

# -----------------------------------------------------------------------------
# Step 5: Run benchmarks
# -----------------------------------------------------------------------------
echo ""
echo -e "${YELLOW}[Step 5] Running benchmarks...${NC}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

if warn_if_throttling; then
    read -p "Continue anyway? (y/N) " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Aborted by user."
        exit 1
    fi
fi

RESULT_FILE_TANSTACK="${RESULTS_DIR}/${TIMESTAMP}_tanstack.txt"
RESULT_FILE_REAL_ROUTER="${RESULTS_DIR}/${TIMESTAMP}_real-router.txt"

# --- TanStack Router ---
echo ""
echo -e "${CYAN}╔════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║  [1/2] TanStack Router                ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════╝${NC}"
sync && sudo purge || true
NODE_ENV=production nice -n -20 vitest bench \
    --config vs-tanstack/tanstack/react/vite.config.ts \
    vs-tanstack/tanstack/react/speed.bench.ts 2>&1 | tee "$RESULT_FILE_TANSTACK"
echo -e "${GREEN}✓ TanStack Router done, cooling down ${SHORT_COOLDOWN}s...${NC}"
sleep "$SHORT_COOLDOWN"

# --- Real-Router ---
echo ""
echo -e "${CYAN}╔════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║  [2/2] Real-Router                    ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════╝${NC}"
sync && sudo purge || true
NODE_ENV=production nice -n -20 vitest bench \
    --config vs-tanstack/real-router/react/vite.config.ts \
    vs-tanstack/real-router/react/speed.bench.ts 2>&1 | tee "$RESULT_FILE_REAL_ROUTER"
echo -e "${GREEN}✓ Real-Router done${NC}"

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
echo -e "${GREEN}=== Client-Nav Benchmark Complete ===${NC}"
echo "Results saved to: $RESULTS_DIR"
echo ""
echo "Files:"
echo "  TanStack Router: $RESULT_FILE_TANSTACK"
echo "  Real-Router:     $RESULT_FILE_REAL_ROUTER"
echo ""
echo "Compare the 'hz' (operations/second) values from vitest bench output above."
echo "Higher hz = faster router."
