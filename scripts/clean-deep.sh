#!/bin/bash

# Deep clean script - removes EVERYTHING including node_modules
# Usage: ./scripts/clean-deep.sh

set -e  # Exit on error

echo "🔥 Starting DEEP clean of real-router monorepo (including node_modules)..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_step() {
    echo -e "${GREEN}➜${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

# Warning
print_warning "This will remove ALL node_modules directories!"
read -p "Are you sure? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    print_error "Aborted by user"
    exit 1
fi

# Step 1: Remove all dist directories
print_step "Removing all dist directories..."
find . -type d -name "dist" -not -path "*/node_modules/*" -exec rm -rf {} + 2>/dev/null || true

# Step 2: Remove all .turbo directories
print_step "Removing all .turbo cache directories..."
rm -rf .turbo
find . -type d -name ".turbo" -not -path "*/node_modules/*" -exec rm -rf {} + 2>/dev/null || true

# Step 3: Remove all node_modules
print_step "Removing all node_modules directories..."
rm -rf node_modules
find packages -type d -name "node_modules" -exec rm -rf {} + 2>/dev/null || true

# Step 4: Remove pnpm-lock.yaml
print_step "Removing pnpm-lock.yaml..."
rm -f pnpm-lock.yaml

# Step 5: Remove coverage directories
print_step "Removing coverage directories..."
find . -type d -name "coverage" -not -path "*/node_modules/*" -exec rm -rf {} + 2>/dev/null || true

# Step 6: Remove vitest cache
print_step "Removing vitest cache..."
find . -type d -name ".vitest" -not -path "*/node_modules/*" -exec rm -rf {} + 2>/dev/null || true

echo ""
echo -e "${GREEN}✓${NC} Deep clean complete!"
echo ""
echo "Next steps:"
echo "  1. Run 'pnpm install' to reinstall all dependencies"
echo "  2. Run 'pnpm build' to rebuild all packages"
