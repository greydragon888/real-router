#!/bin/bash

# Clean build artifacts + ALL tool caches (turbo, ESLint, tsc, vitest, coverage).
#
# This file is the SINGLE SOURCE OF TRUTH for the artifact/cache list:
# clean-deep.sh sources it and reuses clean_artifacts(), so the two scripts can
# never drift again (they previously did — clean-all used `find packages` while
# clean-deep used `find . -not node_modules`, and BOTH forgot .eslintcache and
# *.tsbuildinfo*).
#
# Why .eslintcache and *.tsbuildinfo* MUST be purged here: ESLint (`--cache`) and
# tsc (incremental `.tsbuildinfo`) keep their OWN on-disk caches that live outside
# turbo's output set (lint/type-check declare `outputs: []`). `turbo --force`
# invalidates the turbo cache but NOT these, so a "clean" lint/type-check run
# stays silently warm — a true cold run is ~20x slower (cold lint ≈ 1440s CPU vs
# ~72s warm). Leaving them out makes any cold-build measurement meaningless.
# See IMPLEMENTATION_NOTES.md "Cache layers & honest cold builds".
#
# Usage: ./scripts/clean-all.sh

set -e  # Exit on error

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

print_step()    { echo -e "${GREEN}➜${NC} $1"; }
print_warning() { echo -e "${YELLOW}⚠${NC} $1"; }

# Remove every build artifact and tool cache across the whole repo (packages/ AND
# examples/). Paths exclude node_modules, so it is safe to run with deps
# installed; tool caches that live inside node_modules are covered explicitly
# (node_modules/.cache, node_modules/.vite).
clean_artifacts() {
    print_step "Removing dist/ build artifacts..."
    find . -type d -name "dist" -not -path "*/node_modules/*" -exec rm -rf {} + 2>/dev/null || true

    print_step "Removing .turbo cache..."
    rm -rf .turbo
    find . -type d -name ".turbo" -not -path "*/node_modules/*" -exec rm -rf {} + 2>/dev/null || true

    print_step "Removing node_modules/.cache..."
    find . -type d -path "*/node_modules/.cache" -exec rm -rf {} + 2>/dev/null || true

    print_step "Removing coverage/ reports..."
    find . -type d -name "coverage" -not -path "*/node_modules/*" -exec rm -rf {} + 2>/dev/null || true

    print_step "Removing vitest/vite caches (.vitest, node_modules/.vite)..."
    find . -type d -name ".vitest" -not -path "*/node_modules/*" -exec rm -rf {} + 2>/dev/null || true
    find . -type d -path "*/node_modules/.vite" -exec rm -rf {} + 2>/dev/null || true

    # --- tool caches that turbo --force does NOT invalidate (see header) ---
    print_step "Removing ESLint cache (.eslintcache)..."
    find . -name ".eslintcache" -not -path "*/node_modules/*" -delete 2>/dev/null || true

    print_step "Removing tsc incremental cache (*.tsbuildinfo*)..."
    find . -name "*.tsbuildinfo*" -not -path "*/node_modules/*" -delete 2>/dev/null || true
}

# Run as "main" only when executed directly — NOT when sourced by clean-deep.sh.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    echo "🧹 Cleaning real-router build artifacts + caches..."
    clean_artifacts
    echo ""
    echo -e "${GREEN}✓${NC} Clean complete!"
    echo ""
    echo "Next steps:"
    echo "  1. Run 'pnpm build' to rebuild all packages"
fi
