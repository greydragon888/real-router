#!/bin/bash

# Deep clean — everything clean-all.sh removes, PLUS node_modules and the
# lockfile. It SOURCES clean-all.sh and reuses clean_artifacts(), so the
# artifact/cache list lives in exactly one place and the two scripts cannot
# drift (see clean-all.sh header for why that matters).
#
# Usage: ./scripts/clean-deep.sh

set -e  # Exit on error

# Source clean-all.sh for clean_artifacts() + print helpers + colors. The
# BASH_SOURCE guard in clean-all.sh keeps its "main" block from running on source.
# shellcheck source=clean-all.sh
source "$(dirname "${BASH_SOURCE[0]}")/clean-all.sh"

RED='\033[0;31m'
print_error() { echo -e "${RED}✗${NC} $1"; }

# Warning + confirmation
print_warning "This will remove ALL node_modules directories AND pnpm-lock.yaml!"
read -p "Are you sure? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    print_error "Aborted by user"
    exit 1
fi

echo "🔥 DEEP clean of real-router monorepo (including node_modules)..."

# Step 1: build artifacts + all tool caches (shared with clean-all.sh)
clean_artifacts

# Step 2: node_modules
print_step "Removing all node_modules directories..."
rm -rf node_modules
find packages -type d -name "node_modules" -exec rm -rf {} + 2>/dev/null || true

# Step 3: lockfile
print_step "Removing pnpm-lock.yaml..."
rm -f pnpm-lock.yaml

echo ""
echo -e "${GREEN}✓${NC} Deep clean complete!"
echo ""
echo "Next steps:"
echo "  1. Run 'pnpm install' to reinstall all dependencies"
echo "  2. Run 'pnpm build' to rebuild all packages"
