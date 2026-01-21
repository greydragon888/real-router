import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Vitest configuration for Stryker mutation testing (real-router)
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
      "@real-router/core": path.resolve(import.meta.dirname, "./src"),
      // Workspace dependencies - resolve through node_modules symlinks
      "route-tree": path.resolve(
        import.meta.dirname,
        "./node_modules/route-tree",
      ),
      logger: path.resolve(import.meta.dirname, "./node_modules/logger"),
    },
  },

  test: {
    // Test environment
    environment: "node",
    globals: true,

    // Include all test files (same pattern as vitest-react-profiler)
    include: ["./tests/**/*.test.ts", "./tests/**/*.test.tsx"],

    // Setup files for matcher registration
    setupFiles: ["./tests/setup.ts"],

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
