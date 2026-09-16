#!/usr/bin/env bash
# Sample the runner cgroup's memory counters around a measured step (#2376).
#
# Why: hitting `memory.max` makes the kernel force-reclaim rather than kill, so
# `oom_kill` stays 0, the journal records nothing, and the unit's
# OOMScoreAdjust / OOMPolicy guards never fire — they guard the kill path, and
# there is no kill. Direct reclaim stalls the measured process and re-faults its
# file pages, which moves exactly the components a simulation run reports. The
# only trace is a counter, and until this script nobody read it.
#
# Measured 2026-09-16 on the runner: memory.events `max` 2208 over 5.5 days,
# `oom_kill` 0, MemoryPeak exactly MemoryMax + one page. cgroup v2 counts page
# cache against the limit and these suites read heavily, so the ceiling is
# reached by cache rather than by demand.
#
# Usage:
#   cgroup-sample.sh capture <snapshot-file>
#   cgroup-sample.sh report <before-file> <after-file> <label>
#
# bash 3.2 compatible (repo floor): no associative arrays, no ${v^^}, no mapfile.

set -euo pipefail

die() {
  # A sampler that reports zeros when it cannot read is worse than no sampler:
  # the failure direction looks like good news. Fail the step instead.
  printf '::error title=cgroup sampler::%s\n' "$1" >&2
  exit 1
}

resolve_cgroup() {
  # cgroup v2: the unified hierarchy is the line whose first field is `0`. The
  # path is relative to the cgroup mount. Deriving it beats hardcoding the unit
  # name, which embeds this host's IP-derived hostname and would break silently
  # on any rename.
  [ -r /proc/self/cgroup ] || die "/proc/self/cgroup is not readable"

  suffix=$(awk -F: '$1 == "0" { print $3; exit }' /proc/self/cgroup)
  [ -n "$suffix" ] || die "no cgroup v2 (unified) entry in /proc/self/cgroup"

  path="/sys/fs/cgroup${suffix}"
  [ -d "$path" ] || die "resolved cgroup path does not exist: $path"
  [ -r "$path/memory.events" ] || die "cannot read $path/memory.events"
  [ -r "$path/memory.pressure" ] || die "cannot read $path/memory.pressure"

  printf '%s\n' "$path"
}

# events_field <file> <name> — a `memory.events` line is "<name> <count>".
events_field() {
  awk -v k="$2" '$1 == k { print $2; found = 1 } END { if (!found) print "" }' "$1"
}

# pressure_total <file> <some|full> — the `total=` microsecond counter.
pressure_total() {
  awk -v k="$2" '$1 == k { for (i = 2; i <= NF; i++) if ($i ~ /^total=/) { sub(/^total=/, "", $i); print $i; found = 1 } } END { if (!found) print "" }' "$1"
}

# compute <extractor> <key> — sets D_BEFORE / D_AFTER / D_DELTA.
#
# ⚠ Called PLAINLY, never inside $( ). `die` must run in the script's own shell:
# from a command substitution its `exit 1` leaves only the subshell, the caller
# carries on with an empty value, and the failure surfaces — if at all — as an
# unrelated `unbound variable` further down. Caught by this script's own
# malformed-input control.
D_BEFORE=""
D_AFTER=""
D_DELTA=""
compute() {
  D_BEFORE=$("$1" "$before" "$2")
  D_AFTER=$("$1" "$after" "$2")
  case "$D_BEFORE" in ''|*[!0-9]*) die "field '$2' missing or not a number in $before" ;; esac
  case "$D_AFTER" in ''|*[!0-9]*) die "field '$2' missing or not a number in $after" ;; esac
  D_DELTA=$((D_AFTER - D_BEFORE))
}

case "${1:-}" in
  capture)
    [ $# -eq 2 ] || die "usage: $0 capture <snapshot-file>"
    cg=$(resolve_cgroup)
    {
      printf '# cgroup %s\n' "$cg"
      cat "$cg/memory.events"
      cat "$cg/memory.pressure"
    } > "$2"
    printf 'cgroup sampler: captured %s from %s\n' "$2" "$cg"
    ;;

  report)
    [ $# -eq 4 ] || die "usage: $0 report <before-file> <after-file> <label>"
    before=$2
    after=$3
    label=$4
    [ -r "$before" ] || die "before-snapshot not readable: $before"
    [ -r "$after" ] || die "after-snapshot not readable: $after"

    compute events_field max
    max_b=$D_BEFORE max_a=$D_AFTER max_d=$D_DELTA
    compute events_field high
    high_d=$D_DELTA
    compute events_field oom
    oom_d=$D_DELTA
    compute events_field oom_kill
    kill_d=$D_DELTA
    compute pressure_total some
    some_d=$D_DELTA
    compute pressure_total full
    full_d=$D_DELTA

    summary="${GITHUB_STEP_SUMMARY:-/dev/stdout}"
    # shellcheck disable=SC2016 # the backticks below are MARKDOWN for the job
    # summary and `%s` is printf's; neither is a shell expansion, so single
    # quotes are what keeps them literal.
    {
      printf '### cgroup memory during `%s`\n\n' "$label"
      printf '| counter | delta over the step |\n'
      printf '| --- | ---: |\n'
      printf '| `memory.events max` — times pushed to `memory.max` | **%s** |\n' "$max_d"
      printf '| `memory.events high` | %s |\n' "$high_d"
      printf '| `memory.events oom` / `oom_kill` | %s / %s |\n' "$oom_d" "$kill_d"
      printf '| `memory.pressure some` (µs stalled) | %s |\n' "$some_d"
      printf '| `memory.pressure full` (µs, all tasks stalled) | %s |\n' "$full_d"
      printf '\n'
      if [ "$max_d" -gt 0 ] || [ "$full_d" -gt 0 ]; then
        printf '> ⚠ **This job reclaimed under its cgroup ceiling.** Direct reclaim stalls the\n'
        printf '> measured process and re-faults its file pages, so treat this run as suspect\n'
        printf '> and do not let it seed a baseline without a second measurement (#2375).\n'
      else
        printf '> No reclaim during this step — counters unchanged (`max` %s → %s).\n' "$max_b" "$max_a"
      fi
    } >> "$summary"

    if [ "$max_d" -gt 0 ] || [ "$full_d" -gt 0 ]; then
      printf '::warning title=cgroup reclaim during %s::memory.events max +%s, memory.pressure full +%s us — this measurement is suspect (#2375)\n' \
        "$label" "$max_d" "$full_d"
    fi
    ;;

  *)
    die "usage: $0 capture <file> | report <before> <after> <label>"
    ;;
esac
