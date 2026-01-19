import { defineConfig, mergeConfig } from "vitest/config";
import { commonConfig } from "./vitest.config.common.mjs";

/**
 * Vitest configuration for unit and integration tests
 *
 * Extends common config with:
 * - Code coverage enabled (100% thresholds)
 * - Includes functional, unit, performance, and integration tests
 * - Excludes property-based tests
 * - Default test timeout (30s)
 * - 4 workers for parallelism
 *
 * @see https://vitest.dev/config/
 */
export default mergeConfig(
  commonConfig,
  defineConfig({
    test: {
      /**
       * Coverage configuration
       * Enabled with strict 100% thresholds (real-router standard)
       */
      coverage: {
        enabled: true,
        provider: "v8",
        reporter: [
          ["text", { skipFull: true }],
          "json",
          "json-summary",
          "lcov",
          "lcovonly",
        ],
        reportsDirectory: "./coverage",
        clean: true,
        include: [
          "packages/*/modules/tests/**/*.test.ts",
          "packages/*/modules/tests/**/*.test.tsx",
        ],
        exclude: [
          "**/node_modules/**",
          "**/dist/**",
          "**/coverage/**",
          "**/.stryker-tmp/**",
          "**/tests/**",
          "**/*.config.*",
          "**/*.d.ts",
          "**/*.test.{ts,tsx}",
          "**/*.spec.{ts,tsx}",
          "**/types/**",
          "**/__mocks__/**",
          "**/__fixtures__/**",
          "**/assets",
          "**/contexts.ts",
          "**/enums.ts",
          "**/interfaces.ts",
          "**/constants.ts",
          "**/index.ts",
        ],
        thresholds: {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
      },

      /**
       * Reporter configuration
       */
      reporters: ["dot"],

      /**
       * Test filtering
       * Include functional, unit, performance, and integration tests
       * Exclude property-based tests (they run separately)
       */
      include: [
        "**/tests/functional/**/*.test.ts?(x)",
        "**/tests/unit/**/*.test.ts?(x)",
        "**/tests/performance/**/*.test.ts?(x)",
        "**/tests/integration/**/*.test.ts?(x)",
      ],
      exclude: [
        "node_modules",
        "dist",
        ".idea",
        ".git",
        ".cache",
        "coverage",
        "**/tests/property/**/*.properties.{ts,tsx}",
        "**/tests/benchmarks/**/*.bench.{ts,tsx}",
      ],

      /**
       * Timeout configuration
       * Reduced from 240000ms to 30000ms for faster feedback
       */
      testTimeout: 30000,
      hookTimeout: 30000,

      /**
       * Pool configuration
       * Use threads pool for better performance with async tests
       * Limit parallelism to prevent memory exhaustion
       */
      pool: "threads",
      maxWorkers: 4,
    },
  }),
);
