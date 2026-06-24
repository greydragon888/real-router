import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Vitest configuration for Stryker mutation testing (rx)
 *
 * Standalone config - does not extend base to avoid sandbox resolution issues.
 * Optimized for mutation testing speed and isolation.
 *
 * Alias rules (mirrors logger-plugin):
 * - THIS package: relative ./src = sandbox-mutated code. rx's own tests import
 *   via relative paths (../../src), so this self-alias is parity-only, kept for
 *   consistency and future package-name imports.
 * - Workspace dep @real-router/core: ORIGINAL (unmutated) src — we mutate rx, not
 *   core. Paths are computed (portable), not hardcoded. The `/api` subpath is
 *   listed first so it matches before the bare `@real-router/core` prefix.
 */
export default defineConfig({
  cacheDir: "./.vitest-stryker",

  resolve: {
    // Resolve workspace deps to their src via the internal-source export
    // condition (sandbox node_modules symlinks → original src). Do NOT add
    // manual aliases for deps: they break vitest's module dedup so rx's own
    // barrel-reached code (state$/events$/operators) loads a non-instrumented
    // copy and loses Stryker mutant activation (false 0% coverage).
    conditions: ["@real-router/internal-source", "import", "node"],
    alias: {
      "@real-router/rx": path.resolve(import.meta.dirname, "./src"),
    },
  },

  test: {
    // Test environment
    environment: "node",
    globals: true,

    // Include all test files (unit/ + integration/)
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
