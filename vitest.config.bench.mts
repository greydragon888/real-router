import { defineConfig, mergeConfig } from "vitest/config";
import { commonConfig } from "./vitest.config.common.mjs";

/**
 * Vitest configuration for benchmarking
 *
 * Benchmarks measure performance with process isolation for stable results.
 *
 * Extends common config with overrides:
 * - Coverage disabled
 * - Process isolation (forks pool)
 * - Minimal features enabled (globals: false)
 * - Extended timeout (10 minutes)
 * - Single worker for stability
 *
 * @see https://vitest.dev/config/
 */
export default mergeConfig(
  commonConfig,
  defineConfig({
    cacheDir: "./.vitest-bench", // Separate cache for benchmarks

    // Build optimization for benchmarks
    optimizeDeps: {
      force: true, // Force optimization
    },

    // Disable logging for clean results
    logLevel: "error",

    test: {
      // Settings for benchmark stability
      pool: "forks", // Process isolation (OVERRIDE common config's threads)
      isolate: true, // Full isolation

      execArgv: [
        // Node.js flags
        "--expose-gc", // Access to GC
        "--max-old-space-size=4096", // More memory per process
      ],

      // Disable unnecessary features for benchmarks (OVERRIDE common config)
      globals: false,
      clearMocks: false,
      mockReset: false,
      restoreMocks: false,
      unstubEnvs: false,
      unstubGlobals: false,

      // No setup files by default for benchmarks
      // Packages can override this if needed (e.g., react-real-router)
      setupFiles: [],

      // Timeouts for long benchmarks
      testTimeout: 600000, // 10 minutes per test
      hookTimeout: 60000, // 1 minute for hooks

      // Only benchmarks
      includeSource: [],
      include: [], // Clear regular tests

      // Benchmark settings
      benchmark: {
        // Reporters
        reporters: ["default"],

        // Output results
        outputJson: "./.bench/results.json",

        // Benchmark paths
        include: [
          "./packages/*/tests/benchmarks/**/*.bench.ts",
          "./packages/*/tests/benchmarks/**/*.bench.tsx",
        ],
        exclude: ["node_modules", "dist", "**/*.test.ts"],

        // Result verbosity
        includeSamples: false,
      },

      // Disable coverage for benchmarks
      coverage: {
        enabled: false,
      },

      // Output settings
      reporters: [["default", { summary: false }]], // Minimal output (basic removed in Vitest 4)
      outputFile: "./.bench/output.txt",

      // Disable watch for benchmarks
      watch: false,

      // Parallelism
      maxConcurrency: 1, // One test at a time for stability
      maxWorkers: 1, // One worker
    },
  }),
);
