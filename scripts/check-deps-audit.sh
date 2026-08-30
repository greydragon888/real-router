#!/bin/bash

# Vulnerability scan over pnpm-lock.yaml + all Cargo.lock via osv-scanner.
# Mirrors the GHSA database used by GitHub Dependency Review, but runs
# locally before push instead of waiting for CI.
#
# Skips gracefully when osv-scanner isn't installed — keeps the hook
# non-blocking for fresh clones. Install with:
#   brew install osv-scanner
# or download from https://github.com/google/osv-scanner/releases.
#
# Usage: ./scripts/check-deps-audit.sh

set -e

if ! command -v osv-scanner >/dev/null 2>&1; then
  echo "⚠️  osv-scanner not found — skipping dependency audit."
  echo "    Install with: brew install osv-scanner"
  echo "    (Hook stays non-blocking; CI Dependency Review still runs.)"
  exit 0
fi

# Everything is resolved from the script's own location, never from cwd: the
# config path used to be the relative `scripts/osv-scanner.toml`, so invoking
# this from anywhere but the repo root silently dropped the whole allowlist
# (measured: 21 advisories, 42 rows) instead of failing.
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Enumerate the lockfiles explicitly instead of walking the tree (#1992).
# `osv-scanner scan source --recursive .` resolves .gitignore by walking UP
# from the scan root and then tests the root against those rules — so a
# checkout that sits under an ignored ancestor path (every agent worktree, at
# .claude/worktrees/, matched by `/.claude/*`) is itself "ignored", the walk
# ends at one inode with zero extractions, and osv-scanner exits 128. Measured
# on 2.3.8 AND on 2.5.1; a real `.git` directory at the scan root does not stop
# it, so this is not about worktrees (upstream: google/osv-scanner#286, closed
# by a test-only workaround).
#
# ⚠ `--no-ignore` is NOT the alternative: it makes the walk pick up the
# lockfiles of OTHER worktrees under .claude/ plus vendored node_modules trees
# (45 extractions where 3 are ours, 13.5s), so the verdict starts depending on
# unrelated branches. Enumerating gives byte-identical coverage — the same 3
# extractions the healthy walk finds — in 33ms.
#
# The list is derived, never hardcoded: a fourth Tauri example would otherwise
# fall out of audit scope in silence. `--cached --others --exclude-standard` is
# exactly what the walk covered (tracked + untracked-but-not-ignored).
if git -C "$REPO_ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  lockfiles="$(git -C "$REPO_ROOT" ls-files --cached --others --exclude-standard -- \
    'pnpm-lock.yaml' ':(glob)**/pnpm-lock.yaml' 'Cargo.lock' ':(glob)**/Cargo.lock')"
else
  # Not a git checkout (release tarball, vendored copy) — git's index isn't
  # there to ask, so fall back to the filesystem.
  lockfiles="$(cd "$REPO_ROOT" && find . -name node_modules -prune -o \
    \( -name pnpm-lock.yaml -o -name Cargo.lock \) -print | sed 's|^\./||')"
fi

# ⚠ An empty set is "the audit did not run", never "the audit passed". Its own
# exit code, so it can never be mistaken for a finding either.
if [ -z "$lockfiles" ]; then
  echo "⚠️  No lockfiles found under $REPO_ROOT — the audit did NOT run."
  exit 2
fi

# Build `--lockfile <path>` per file. bash 3.2 (macOS) — no arrays, no process
# substitution; positional params are the portable list.
set --
OLDIFS=$IFS
IFS='
'
for f in $lockfiles; do set -- "$@" --lockfile "$f"; done
IFS=$OLDIFS

echo "🔒 auditing $(($# / 2)) lockfile(s)"

# Config (scripts/osv-scanner.toml) mirrors .github/workflows/codeql.yml
# allow-ghsas + adds RUSTSEC unmaintained advisories that GitHub Dependency
# Review doesn't flag (no CVSS) but osv-scanner does.
set +e
# --verbosity warn silences osv-scanner's per-ignore "<id> has been filtered out because:
# <reason>" info logging — one line per IgnoredVulns entry × each matching lockfile (~40 lines,
# doubled by the two identical Tauri desktop-example Cargo.lock files). The results table and
# exit code are result output, not logging, so real findings still surface at warn level.
(cd "$REPO_ROOT" && osv-scanner scan source --config="$SCRIPT_DIR/osv-scanner.toml" "$@" --verbosity warn)
exit_code=$?
set -e

# ⚠ Never collapse these. osv-scanner distinguishes its outcomes by exit code —
# 1 is "found something", 127/128 are "could not run" — and reporting a scan
# that never happened as a finding is only the loud half of that mistake: the
# quiet half (a no-op that reads as a pass) is what `--allow-no-lockfiles`
# would produce, and it is the failure mode this repo keeps finding in its own
# guards (#1838, #1913, #1992).
case $exit_code in
  0) ;;
  1)
    echo ""
    echo "❌ Vulnerabilities detected. Triage steps:"
    echo "   1. Bump the affected package (prefer patch/minor)."
    echo "   2. If unfixable & non-shipped (example/dev), add to"
    echo "      scripts/osv-scanner.toml and .github/workflows/codeql.yml."
    ;;
  *)
    echo ""
    echo "⚠️  osv-scanner could not complete (exit $exit_code) — the audit did NOT run."
    echo "   This is not a clean result: nothing was checked against the GHSA database."
    ;;
esac

exit $exit_code
