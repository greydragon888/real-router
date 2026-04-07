#!/bin/bash

# Clean all script - removes all build artifacts, cache, and turbo cache
# Usage: ./scripts/clean-all.sh

set -e  # Exit on error

echo "🧹 Starting deep clean of real-router monorepo..."

# Colors for output
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

# Step 1: Remove all dist directories
print_step "Removing all dist directories..."
find packages -type d -name "dist" -exec rm -rf {} + 2>/dev/null || true

# Step 2: Remove all .turbo directories
print_step "Removing all .turbo cache directories..."
rm -rf .turbo
find packages -type d -name ".turbo" -exec rm -rf {} + 2>/dev/null || true

# Step 3: Remove node_modules/.cache
print_step "Removing node_modules cache..."
find . -type d -path "*/node_modules/.cache" -exec rm -rf {} + 2>/dev/null || true

# Step 4: Remove coverage directories
print_step "Removing coverage directories..."
find packages -type d -name "coverage" -exec rm -rf {} + 2>/dev/null || true

# Step 5: Remove vitest cache
print_step "Removing vitest cache..."
find . -type d -name ".vitest" -exec rm -rf {} + 2>/dev/null || true

echo ""
echo -e "${GREEN}✓${NC} Clean complete!"
echo ""
echo "Next steps:"
echo "  1. Run 'pnpm install' to ensure dependencies are up to date"
echo "  2. Run 'pnpm build' to rebuild all packages"
