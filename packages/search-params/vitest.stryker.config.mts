import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Vitest configuration for Stryker mutation testing (search-params)
 *
 * Standalone config - does not extend base to avoid sandbox resolution issues.
 * Optimized for mutation testing speed and isolation.
 */
export default defineConfig({
  cacheDir: "./.vitest-stryker",

  // Resolve package imports to local src (required for Stryker sandbox)
  // The sandbox has node_modules symlinked to original, which contains workspace symlinks
  resolve: {
    alias: {
      // Main package - resolve to local src
      "search-params": path.resolve(import.meta.dirname, "./src"),
    },
  },

  test: {
    // Test environment
    environment: "node",
    globals: true,

    // Include all test files
    include: ["./tests/**/*.test.ts", "./tests/**/*.test.tsx"],

    // Exclude patterns
    exclude: ["node_modules", "dist", ".idea", ".git", ".cache", "coverage"],

    // Mock settings
    clearMocks: true,
    restoreMocks: true,
    mockReset: true,

    // Disable watch mode
    watch: false,

    // Optimized timeouts for mutation testing
    testTimeout: 5000,
    hookTimeout: 5000,

    // Use forks for better isolation during mutation testing
    pool: "forks",
    isolate: true,

    // Minimal reporter for speed
    reporters: ["dot"],
  },
});
