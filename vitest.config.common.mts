import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";
import codspeedPlugin from "@codspeed/vitest-plugin";

/**
 * Common Vitest configuration shared across all test types
 *
 * This base configuration contains settings that are common to:
 * - Unit/Integration tests (vitest.config.unit.mts)
 * - Property-based tests (vitest.config.properties.mts)
 * - Benchmarks (vitest.config.bench.mts)
 * - Mutation testing (vitest.stryker.config.mts)
 *
 * Specialized configs extend this using mergeConfig() and override specific settings.
 *
 * @see https://vitest.dev/config/
 */
export const commonConfig = defineConfig({
  /**
   * Plugins
   * - tsconfigPaths: Resolve TypeScript path aliases from tsconfig.json
   * - codspeedPlugin: Performance benchmarking (CI only)
   */
  plugins: process.env.CI
    ? [tsconfigPaths(), codspeedPlugin()]
    : [tsconfigPaths()],

  /**
   * Cache directory for Vitest
   */
  cacheDir: "./.vitest",

  /**
   * Test configuration
   */
  test: {
    /**
     * Test environment - default to node
     * Packages can override this (e.g., react-router6 uses jsdom)
     */
    environment: "node",

    /**
     * Enable global test APIs (describe, it, expect)
     * Without this, you need to import from 'vitest' in each test file
     */
    globals: true,

    /**
     * Test isolation settings
     * Clear mocks and restore mocked functions after each test
     */
    clearMocks: true,
    restoreMocks: true,
    mockReset: true,

    /**
     * Run tests in isolation for accurate profiling
     * Each test gets a fresh environment
     */
    isolate: true,

    /**
     * Disable watch mode by default
     */
    watch: false,

    /**
     * Base exclude patterns
     * Specialized configs can extend this list
     */
    exclude: [
      "node_modules",
      "dist",
      ".idea",
      ".git",
      ".cache",
      "coverage",
      "**/.stryker-tmp/**",
    ],
  },
});
