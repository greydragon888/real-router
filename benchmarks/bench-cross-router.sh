#!/bin/bash
# =============================================================================
# Cross-Router Benchmark Runner — machine-readiness + full unattended matrix
# Sibling of bench-compare.sh, but for the cross-router (Playwright + CDP) suite.
#
# Rebuilds every package's dist, gates on machine readiness for a ~3 h unattended
# run, and — on success — runs the full n=15 matrix across all cohorts, then
# regenerates each REPORT.
#
# ROOT vs USER split (why this is not a straight bench-compare.sh clone):
#   bench-compare.sh runs its mitata workload AS ROOT (node-only, needs nice -20).
#   The cross-router workload drives a real Chromium via Playwright and MUST run
#   as the invoking (non-root) user:
#     • Playwright's browser cache lives under the user's $HOME
#       (~/Library/Caches/ms-playwright) — root's $HOME is /var/root → "Executable
#       doesn't exist".
#     • every dist / results / .turbo artifact must stay user-owned or subsequent
#       non-sudo pnpm/node breaks.
#   So the PRIVILEGED bits (thermal read, purge, Spotlight/Time-Machine toggles,
#   nice -20 set) stay root, and ALL build/benchmark work is delegated back to the
#   user via `sudo -u -H`, inheriting the root-set nice -20 across the priv drop.
#
# Flow: preflight (power/thermal/apps) → disable distractions → rebuild all
# package dist (pnpm bundle) → [optional n=1 smoke] → cooldown → per-cohort
# n=15 matrix → rme-gate → sub-ms sanity re-measure (#1261) → REPORT regen,
# with thermal cooldown + heavy-process recheck between cohorts.
#
# NOTE: deliberately NOT `set -e` — a 3 h unattended run must survive a single
# flaky cell / RME flag and continue to the next cohort. Hard failures (bundle,
# smoke) are handled explicitly; per-cohort failures are tallied, not fatal.
# =============================================================================
set -o pipefail

# Require bash (POSIX-compatible so the message works under sh too)
if [ -z "$BASH_VERSION" ]; then
    echo "Error: This script requires bash. Please run with:"
    echo "  sudo bash $0"
    echo "  or"
    echo "  sudo ./$0"
    exit 1
fi

# --- Defaults (overridable by env / flags) -----------------------------------
RUNS="${RUNS:-15}"                       # samples per (scenario × engine)
COOLDOWN="${COOLDOWN:-60}"               # fallback cooldown when thermal unreadable
MAX_COOLDOWN_WAIT="${MAX_COOLDOWN_WAIT:-300}"
RME_STABLE="${RME_STABLE:-15}"           # RME % threshold — stable metric families
RME_NOISY="${RME_NOISY:-40}"             # RME % threshold — noisy families (blink/latency/fcp)
SANITY_RUNS="${SANITY_RUNS:-12}"         # post-cohort sub-ms sanity re-measure n (0 = skip)
SANITY_SHIFT="${SANITY_SHIFT:-20}"       # % median shift (recorded vs fresh) that flags load
SMOKE=false                              # --smoke: n=1 dry matrix first, abort on any failure
NO_BUILD=false                           # --no-build: skip pnpm bundle (use existing dist)
ASSUME_YES=false                         # --yes / -y: skip interactive prompts (unattended)
ALL_COHORTS="react vue solid svelte angular"
COHORTS=()

# Show help before the sudo check so users can read it without privileges.
show_help() {
    echo "Usage: sudo ./bench-cross-router.sh [OPTIONS] [COHORTS...]"
    echo ""
    echo "Rebuild all package dist, verify machine readiness, then run the full"
    echo "cross-router (Playwright + CDP) matrix and regenerate the REPORTs."
    echo ""
    echo "Arguments:"
    echo "  COHORTS     Subset of: $ALL_COHORTS (default: all)"
    echo ""
    echo "Options:"
    echo "  --runs N    Samples per (scenario × engine)         (default: ${RUNS})"
    echo "  --smoke     Run an n=1 dry matrix first; abort the run if any app"
    echo "              fails to build/drive (fail-fast before the ~3 h commit)"
    echo "  --no-build  Skip 'pnpm bundle' (benchmark existing packages/*/dist)"
    echo "  -y, --yes   Skip interactive prompts (for unattended launch)"
    echo "  -h, --help  Show this help"
    echo ""
    echo "Environment variables:"
    echo "  RUNS               Samples per cell                     (default: 15)"
    echo "  COOLDOWN           Fallback cooldown, thermal unreadable (default: 60)"
    echo "  MAX_COOLDOWN_WAIT  Max thermal cooldown between cohorts  (default: 300)"
    echo "  RME_STABLE         RME % gate, stable families          (default: 15)"
    echo "  RME_NOISY          RME % gate, noisy families           (default: 40)"
    echo "  SANITY_RUNS        Post-cohort sub-ms sanity re-measure n (default: 12; 0 = skip)"
    echo "  SANITY_SHIFT       % shift vs fresh re-measure that flags load inflation (default: 20)"
    echo ""
    echo "Examples:"
    echo "  sudo ./bench-cross-router.sh                  # rebuild + all 5 cohorts, n=15"
    echo "  sudo ./bench-cross-router.sh --smoke          # dry-run first, then the full run"
    echo "  sudo ./bench-cross-router.sh angular          # just the angular cohort"
    echo "  sudo ./bench-cross-router.sh --runs 30 solid  # solid cohort at n=30"
    echo "  sudo ./bench-cross-router.sh --no-build       # skip rebuild (dist already fresh)"
    echo ""
    echo "The full run measures PRODUCTION dist (fairness-critical) — it always"
    echo "rebuilds first unless --no-build. Expect ~2.5-3 h for all 5 cohorts"
    echo "(Angular AOT is the slowest). Chromium runs as \$SUDO_USER, not root."
}

# --- Parse arguments ---------------------------------------------------------
while [[ $# -gt 0 ]]; do
    case "$1" in
        -h|--help) show_help; exit 0 ;;
        --smoke)   SMOKE=true; shift ;;
        --no-build) NO_BUILD=true; shift ;;
        -y|--yes)  ASSUME_YES=true; shift ;;
        --runs)
            if [[ -z "${2:-}" ]]; then echo "Error: --runs needs a value"; exit 1; fi
            RUNS="$2"; shift 2 ;;
        --runs=*)  RUNS="${1#*=}"; shift ;;
        react|vue|solid|svelte|angular) COHORTS+=("$1"); shift ;;
        *) echo "Error: unknown argument '$1' (see --help)"; exit 1 ;;
    esac
done

# No cohort args → all cohorts.
if [[ ${#COHORTS[@]} -eq 0 ]]; then
    # shellcheck disable=SC2206
    COHORTS=($ALL_COHORTS)
fi

if ! [[ "$RUNS" =~ ^[0-9]+$ ]] || [[ "$RUNS" -lt 1 ]]; then
    echo "Error: --runs must be a positive integer (got '$RUNS')"
    exit 1
fi

# --- Require sudo upfront -----------------------------------------------------
if [[ "$EUID" -ne 0 ]]; then
    echo "This script requires sudo privileges (thermal read, purge, nice -20)."
    echo "Please run with: sudo ./bench-cross-router.sh"
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"   # benchmarks/
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"                     # monorepo root
ORIGINAL_USER="${SUDO_USER:-$USER}"

if [[ "$ORIGINAL_USER" == "root" ]]; then
    echo "Error: cannot resolve the invoking user (SUDO_USER is root)."
    echo "Run as a normal user via sudo, not from a root shell — Playwright's"
    echo "Chromium cannot launch as root."
    exit 1
fi

# Reconstruct the invoking user's HOME / shell / PATH: the workload runs as them,
# but sudo resets the environment, so we must rebuild what their login shell sets
# (node/pnpm/turbo live on an nvm/homebrew PATH, and Playwright needs the real HOME).
USER_HOME="$(dscl . -read "/Users/$ORIGINAL_USER" NFSHomeDirectory 2>/dev/null | awk '{print $2}')"
[[ -z "$USER_HOME" ]] && USER_HOME="$(eval echo "~$ORIGINAL_USER")"
USER_SHELL="$(dscl . -read "/Users/$ORIGINAL_USER" UserShell 2>/dev/null | awk '{print $2}')"
[[ -z "$USER_SHELL" ]] && USER_SHELL="/bin/zsh"
# Capture PATH from a full login+interactive shell (sources .zprofile AND .zshrc,
# where nvm/homebrew usually live). Sentinel-wrapped so any dotfile stdout noise
# (neofetch, greetings) can't corrupt the value.
USER_PATH_RAW="$(sudo -u "$ORIGINAL_USER" -H "$USER_SHELL" -ilc 'printf "__RRPATH__%s__RRPATH__" "$PATH"' 2>/dev/null || true)"
USER_ENV_PATH="$(printf '%s' "$USER_PATH_RAW" | sed -n 's/.*__RRPATH__\(.*\)__RRPATH__.*/\1/p')"
if [[ -z "$USER_ENV_PATH" ]]; then
    USER_ENV_PATH="$USER_HOME/.local/share/pnpm:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
    echo "Warning: could not read the user's shell PATH; falling back to: $USER_ENV_PATH"
fi

# Run a command as the invoking user with their reconstructed env, at nice -20.
# nice is set here (as root) and inherited across the sudo priv-drop, so the whole
# Chromium process tree runs at max scheduling priority while owned by the user.
as_user() {
    nice -n -20 sudo -u "$ORIGINAL_USER" -H \
        env "PATH=$USER_ENV_PATH" "HOME=$USER_HOME" \
        bash -c "$1"
}

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

banner() {
    echo ""
    echo -e "${CYAN}╔══════════════════════════════════════════════╗${NC}"
    printf "${CYAN}║${NC}  %-42s${CYAN} ║${NC}\n" "$1"
    echo -e "${CYAN}╚══════════════════════════════════════════════╝${NC}"
}

# Auto-continue under --yes or a non-interactive stdin (unattended launch).
confirm_or_abort() {
    if [[ "$ASSUME_YES" == true || ! -t 0 ]]; then
        echo -e "${YELLOW}  (auto-continue: --yes or non-interactive stdin)${NC}"
        return 0
    fi
    read -p "Continue anyway? (y/N) " -n 1 -r
    echo ""
    if [[ ! "$REPLY" =~ ^[Yy]$ ]]; then
        echo "Aborted by user."
        exit 1
    fi
}

# --- Thermal helpers (Apple Silicon; identical discipline to bench-compare.sh) --
get_thermal_pressure() {
    local output
    output=$(sudo powermetrics --samplers thermal -i 1 -n 1 2>/dev/null)
    echo "$output" | grep -i "pressure level" | awk -F': ' '{print $2}' | tr -d ' '
}

warn_if_throttling() {
    local pressure
    pressure=$(get_thermal_pressure)
    [[ -z "$pressure" ]] && return 1
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

# Heavy CPU processes (same filter as `pnpm cpu`; ignore our own tooling).
heavy_processes() {
    ps -Ao %cpu,comm -r | awk '$1 > 10 && !/webstorm/ && !/claude/ && !/WindowServer/ {print $2 " (" $1 "%)"}' | head -5
}

# Mid-run load recheck (#1261): the Step-1 gate runs BEFORE the run, so load
# starting mid-run goes unnoticed there. Re-run the same heavy-process filter at
# the between-cohort cooldown points — warn-only (an unattended run must keep
# going), tallied for the summary. Thermal is already rechecked by
# wait_for_cooldown at the same points; this adds the process-load half.
LOAD_FLAGGED=""
recheck_load() {
    local heavy
    heavy=$(heavy_processes)
    if [[ -n "$heavy" ]]; then
        echo -e "${YELLOW}  ⚠ heavy processes detected mid-run (>10% CPU) — sub-ms cells near this point are suspect:${NC}"
        echo "$heavy"
        LOAD_FLAGGED="$LOAD_FLAGGED $1"
    fi
}

# --- Cleanup (runs on exit, error, or interrupt) -----------------------------
cleanup() {
    echo ""
    echo -e "${YELLOW}[Cleanup] Restoring system state...${NC}"
    if [[ -n "${CAFFEINATE_PID:-}" ]] && kill -0 "$CAFFEINATE_PID" 2>/dev/null; then
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
# Step 1: System state
# -----------------------------------------------------------------------------
echo -e "${BLUE}=== Cross-Router Benchmark Runner ===${NC}"
echo ""
echo -e "${YELLOW}[Step 1] Checking system state...${NC}"

POWER_SOURCE=$(pmset -g batt 2>/dev/null | head -1 | grep -o "'.*'" | tr -d "'")
BATTERY_PERCENT=$(pmset -g batt 2>/dev/null | grep -o '[0-9]\+%' | tr -d '%')
POWER_WARNING=0
if [[ "$POWER_SOURCE" != "AC Power" ]]; then
    echo -e "${RED}⚠️  WARNING: Running on battery power${NC}"
    [[ -n "$BATTERY_PERCENT" ]] && echo -e "${RED}   Battery level: ${BATTERY_PERCENT}%${NC}"
    echo -e "${RED}   Connect to power — a ~3 h run WILL throttle on battery.${NC}"
    POWER_WARNING=1
else
    echo -e "${GREEN}Running on AC Power${NC}"
fi

DISTRACTING_APPS=""
pgrep -q "Google Chrome" && DISTRACTING_APPS="${DISTRACTING_APPS}  - Google Chrome\n"
pgrep -q "Telegram" && DISTRACTING_APPS="${DISTRACTING_APPS}  - Telegram\n"
pgrep -q "webstorm" && DISTRACTING_APPS="${DISTRACTING_APPS}  - WebStorm\n"
pgrep -q "Slack" && DISTRACTING_APPS="${DISTRACTING_APPS}  - Slack\n"
pgrep -q "Discord" && DISTRACTING_APPS="${DISTRACTING_APPS}  - Discord\n"
pgrep -q "Spotify" && DISTRACTING_APPS="${DISTRACTING_APPS}  - Spotify\n"
if [[ -n "$DISTRACTING_APPS" ]]; then
    echo -e "${YELLOW}Warning: these apps may affect benchmark stability:${NC}"
    echo -e "$DISTRACTING_APPS"
fi

HEAVY_PROCESSES=$(heavy_processes)
if [[ -n "$HEAVY_PROCESSES" ]]; then
    echo -e "${RED}Warning: heavy processes detected (>10% CPU):${NC}"
    echo "$HEAVY_PROCESSES"
fi

if [[ -n "$DISTRACTING_APPS" || -n "$HEAVY_PROCESSES" || "$POWER_WARNING" -eq 1 ]]; then
    echo ""
    confirm_or_abort
else
    echo -e "${GREEN}System state OK (AC power, no distracting apps or heavy processes)${NC}"
fi

# -----------------------------------------------------------------------------
# Step 2: Run plan
# -----------------------------------------------------------------------------
echo ""
echo -e "${YELLOW}[Step 2] Run plan${NC}"
CHIP=$(system_profiler SPHardwareDataType 2>/dev/null | grep "Chip" | awk -F': ' '{print $2}')
THERMAL_PRESSURE=$(get_thermal_pressure)
echo "  Chip: ${CHIP:-unknown}"
echo "  Power: ${POWER_SOURCE:-unknown}${BATTERY_PERCENT:+ (${BATTERY_PERCENT}%)}"
echo "  Thermal pressure: ${THERMAL_PRESSURE:-unknown}"
echo "  Workload user: $ORIGINAL_USER (Chromium runs here, not root)"
echo "  Cohorts: ${COHORTS[*]}"
echo "  Runs (n): $RUNS"
echo "  Rebuild: $([[ "$NO_BUILD" == true ]] && echo 'skipped (--no-build)' || echo 'pnpm bundle (all packages)')"
echo "  Smoke: $([[ "$SMOKE" == true ]] && echo 'yes (n=1 dry matrix first)' || echo 'no')"
echo "  RME gate: stable ${RME_STABLE}% · noisy ${RME_NOISY}%"
echo "  Sub-ms sanity: $([[ "$SANITY_RUNS" -gt 0 ]] && echo "nav-latency × real-router re-measure, n=$SANITY_RUNS, flag |shift| > ${SANITY_SHIFT}%" || echo 'disabled (SANITY_RUNS=0)')"
echo "  Cooldown: wait for Nominal between cohorts (max ${MAX_COOLDOWN_WAIT}s, fallback ${COOLDOWN}s)"

# -----------------------------------------------------------------------------
# Step 3: Disable system distractions
# -----------------------------------------------------------------------------
echo ""
echo -e "${YELLOW}[Step 3] Disabling system distractions...${NC}"
# -d display, -i idle sleep, -m disk sleep, -s system sleep (AC only); -w $$
# ties the assertion to this script's lifetime (auto-releases if we die).
caffeinate -dims -w $$ &
CAFFEINATE_PID=$!
echo -e "${GREEN}Screensaver/sleep disabled (PID: $CAFFEINATE_PID) — held for the whole run${NC}"
sudo mdutil -i off / >/dev/null 2>&1 || true
echo -e "${GREEN}Spotlight indexing disabled${NC}"
sudo tmutil disable >/dev/null 2>&1 || true
echo -e "${GREEN}Time Machine disabled${NC}"
sync && sudo purge 2>/dev/null || true
echo -e "${GREEN}File system caches purged${NC}"

# -----------------------------------------------------------------------------
# Step 4: Rebuild all package dist
# -----------------------------------------------------------------------------
echo ""
if [[ "$NO_BUILD" == true ]]; then
    echo -e "${YELLOW}[Step 4] Skipping rebuild (--no-build) — using existing packages/*/dist${NC}"
    echo -e "${YELLOW}  ⚠ ensure dist is fresh, or the benchmark measures stale code.${NC}"
else
    echo -e "${YELLOW}[Step 4] Rebuilding all package dist (pnpm bundle)...${NC}"
    echo "  cross-router resolves @real-router/* → packages/*/dist/esm — stale dist = stale benchmark."
    if as_user "cd '$ROOT_DIR' && pnpm bundle"; then
        echo -e "${GREEN}  ✓ all package dist rebuilt${NC}"
    else
        echo -e "${RED}  ✗ 'pnpm bundle' failed — aborting (cannot benchmark broken/stale dist)${NC}"
        exit 1
    fi
fi

# -----------------------------------------------------------------------------
# Step 5: Optional smoke (n=1 dry matrix) — fail fast before the long run
# -----------------------------------------------------------------------------
if [[ "$SMOKE" == true ]]; then
    echo ""
    echo -e "${YELLOW}[Step 5] Smoke (n=1) — every app builds + drives before the ~3 h run...${NC}"
    echo "  (writes throwaway n=1 results; the real n=$RUNS run overwrites them.)"
    SMOKE_FAILED=""
    for cohort in "${COHORTS[@]}"; do
        echo -e "${BLUE}  smoke: $cohort...${NC}"
        if as_user "cd '$SCRIPT_DIR' && node cross-router/run-all.mjs 1 $cohort"; then
            echo -e "${GREEN}  ✓ $cohort smoke ok${NC}"
        else
            echo -e "${RED}  ✗ $cohort smoke FAILED${NC}"
            SMOKE_FAILED="$SMOKE_FAILED $cohort"
        fi
    done
    if [[ -n "$SMOKE_FAILED" ]]; then
        echo -e "${RED}Smoke failed for:$SMOKE_FAILED — aborting before the n=$RUNS run.${NC}"
        echo -e "${RED}Fix the build/driver errors above (see the '!! FAILED' lines), then re-run.${NC}"
        exit 1
    fi
    echo -e "${GREEN}Smoke passed for all selected cohorts — proceeding.${NC}"
fi

# -----------------------------------------------------------------------------
# Step 6: Cooldown after build heat, then run the full matrix per cohort
# -----------------------------------------------------------------------------
echo ""
echo -e "${YELLOW}[Step 6] Cooling down after rebuild before the first cohort...${NC}"
wait_for_cooldown "$MAX_COOLDOWN_WAIT"

if warn_if_throttling; then confirm_or_abort; fi

LAST_COHORT="${COHORTS[${#COHORTS[@]}-1]}"   # bash 3.2: no ${arr[-1]}
FAILED_COHORTS=""
RME_FLAGGED=""
SANITY_FLAGGED=""
REPORT_FAILED=""

for cohort in "${COHORTS[@]}"; do
    banner "Cohort: $cohort  (n=$RUNS)"

    # react-only: capability demos feed report.mjs's ✓ⁱ matrix (verify-features
    # is hardcoded to FW=react). Skipped for other cohorts (no such apps).
    if [[ "$cohort" == "react" ]]; then
        echo -e "${BLUE}  Verifying capability features (react)...${NC}"
        if as_user "cd '$SCRIPT_DIR' && node cross-router/harness/verify-features.mjs"; then
            echo -e "${GREEN}  ✓ capability features verified${NC}"
        else
            echo -e "${YELLOW}  ⚠ verify-features failed — react capability matrix may be stale${NC}"
        fi
    fi

    # Perf matrix. run-all continues past a failed cell but exits 1 if any failed;
    # we tally and move on (a flaky cell must not kill the remaining cohorts).
    echo -e "${BLUE}  Running perf matrix (n=$RUNS)...${NC}"
    if as_user "cd '$SCRIPT_DIR' && node cross-router/run-all.mjs $RUNS $cohort"; then
        echo -e "${GREEN}  ✓ $cohort matrix complete${NC}"
    else
        echo -e "${RED}  ⚠ $cohort matrix had failed cells (see '!! FAILED' above)${NC}"
        FAILED_COHORTS="$FAILED_COHORTS $cohort"
    fi

    # RME quality gate (non-fatal): prints offenders worst-first; exit 1 = over
    # threshold, 2 = no results. Either way we only flag — results are still written.
    if as_user "cd '$SCRIPT_DIR' && node cross-router/harness/rme-gate.mjs $RME_STABLE $RME_NOISY $cohort"; then
        echo -e "${GREEN}  ✓ $cohort RME within thresholds${NC}"
    else
        echo -e "${YELLOW}  ⚠ $cohort RME flagged (or no results) — numbers may be noisy${NC}"
        RME_FLAGGED="$RME_FLAGGED $cohort"
    fi

    # Sub-ms sanity re-measure (non-fatal, #1261): the readiness gate can't see
    # load that appears MID-RUN, and the RME gate can't either — a uniformly
    # load-inflated cell is internally consistent (07-05: nav-latency +47% with
    # RME green). Re-measure the canonical sub-ms cell at small n (results/ is
    # NOT touched) and compare medians vs what the matrix just wrote — a material
    # shift means this cohort's sub-ms per-nav absolutes are load-tainted.
    if [[ "$SANITY_RUNS" -gt 0 ]]; then
        echo -e "${BLUE}  Sub-ms sanity re-measure (nav-latency × real-router, n=$SANITY_RUNS)...${NC}"
        as_user "cd '$SCRIPT_DIR' && node cross-router/harness/sanity-remeasure.mjs $cohort $SANITY_RUNS $SANITY_SHIFT"
        sanity_rc=$?
        if [[ "$sanity_rc" -eq 0 ]]; then
            echo -e "${GREEN}  ✓ $cohort sub-ms consistent with a fresh re-measure${NC}"
        elif [[ "$sanity_rc" -eq 2 ]]; then
            echo -e "${YELLOW}  ⚠ $cohort sanity re-measure skipped (no recorded nav-latency cell)${NC}"
        else
            echo -e "${YELLOW}  ⚠ $cohort sub-ms shifted vs fresh re-measure — sub-ms absolutes suspect${NC}"
            SANITY_FLAGGED="$SANITY_FLAGGED $cohort"
        fi
    fi

    # Regenerate the committed REPORT from results/.
    if as_user "cd '$SCRIPT_DIR' && node cross-router/harness/report.mjs $cohort"; then
        echo -e "${GREEN}  ✓ REPORT regenerated${NC}"
    else
        echo -e "${RED}  ⚠ report.mjs $cohort failed${NC}"
        REPORT_FAILED="$REPORT_FAILED $cohort"
    fi

    if [[ "$cohort" != "$LAST_COHORT" ]]; then
        echo ""
        echo -e "${YELLOW}Cohort $cohort done. Thermal cooldown before the next...${NC}"
        recheck_load "$cohort"
        wait_for_cooldown "$MAX_COOLDOWN_WAIT"
    fi
done

# -----------------------------------------------------------------------------
# Step 7: Summary
# -----------------------------------------------------------------------------
echo ""
banner "Cross-Router Benchmark Complete"
echo "  Elapsed: $((SECONDS / 60)) min ($((SECONDS / 3600))h $(((SECONDS % 3600) / 60))m)"
echo "  Cohorts run: ${COHORTS[*]} (n=$RUNS)"
echo "  Results:  $SCRIPT_DIR/cross-router/results/<cohort>/ (gitignored)"
echo "  REPORTs:  $SCRIPT_DIR/cross-router/REPORT[-<cohort>].md (regenerated)"
echo ""
if [[ -n "$FAILED_COHORTS" ]]; then
    echo -e "${RED}  ⚠ cohorts with failed matrix cells:$FAILED_COHORTS${NC}"
    echo -e "${RED}    → re-run those cohorts; REPORTs from partial results may be incomplete.${NC}"
fi
if [[ -n "$RME_FLAGGED" ]]; then
    echo -e "${YELLOW}  ⚠ cohorts flagged by the RME gate:$RME_FLAGGED${NC}"
    echo -e "${YELLOW}    → inspect the offenders above; consider re-running (thermal/noise).${NC}"
fi
if [[ -n "$SANITY_FLAGGED" ]]; then
    echo -e "${YELLOW}  ⚠ cohorts whose sub-ms class failed the sanity re-measure:$SANITY_FLAGGED${NC}"
    echo -e "${YELLOW}    → sub-ms per-nav absolutes are load-tainted (stable classes are fine);${NC}"
    echo -e "${YELLOW}      re-run those cohorts before trusting/committing sub-ms numbers.${NC}"
fi
if [[ -n "$LOAD_FLAGGED" ]]; then
    echo -e "${YELLOW}  ⚠ heavy processes appeared mid-run (after cohorts:$LOAD_FLAGGED)${NC}"
    echo -e "${YELLOW}    → sub-ms cells measured near those points are suspect.${NC}"
fi
if [[ -n "$REPORT_FAILED" ]]; then
    echo -e "${RED}  ⚠ REPORT regeneration failed for:$REPORT_FAILED${NC}"
fi
if [[ -z "$FAILED_COHORTS" && -z "$RME_FLAGGED" && -z "$SANITY_FLAGGED" && -z "$LOAD_FLAGGED" && -z "$REPORT_FAILED" ]]; then
    echo -e "${GREEN}  ✓ clean run — all cohorts complete, RME + sub-ms sanity clean, REPORTs regenerated.${NC}"
    echo -e "${GREEN}    Review git diff of cross-router/REPORT*.md, then commit.${NC}"
fi
echo ""
