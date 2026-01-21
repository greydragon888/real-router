/**
 * ✨ Mutation testing configuration for Plugin Logger
 *
 * Based on successful experience from router-error:
 * ✅ Vitest runner + perTest coverage
 * ✅ Absolute paths for workspace dependencies (logger, real-router, real-router-types)
 * ✅ Incremental mode for caching
 * ✅ Without "tests slash-star-star" in ignorePatterns
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  packageManager: "npm",
  testRunner: "vitest",
  checkers: ["typescript"],

  // Mutate all source code except barrel exports, types and constants
  mutate: [
    "src/**/*.ts",
    "!src/index.ts", // Barrel export - skip
    "!src/types.ts", // Type definitions - skip
    "!src/constants.ts", // Constants - skip
  ],

  // Vitest runner with optimized configuration
  vitest: {
    configFile: "vitest.stryker.config.mts",
    related: false, // Disable related test detection (barrel export issue)
  },

  // ✨ CRITICAL: "perTest" is ignored for Vitest, but kept for compatibility
  // Workspace dependencies work through absolute paths in vitest.stryker.config.mts
  coverageAnalysis: "perTest",

  // Local tsconfig
  tsconfigFile: "tsconfig.json",

  // Mutation score thresholds
  thresholds: {
    high: 85, // Plugin is more complex - medium threshold
    low: 70,
    break: 60,
  },

  // Performance settings
  concurrency: 2, // 2 parallel processes
  timeoutMS: 10000, // 10s (tests are fast)
  timeoutFactor: 3, // 3x safety margin

  // Reporters
  reporters: ["progress", "clear-text", "html"],
  htmlReporter: {
    fileName: "reports/mutation-report.html",
  },

  // ⚠️ CRITICAL: DO NOT exclude tests/ - they are needed in sandbox!
  ignorePatterns: [
    "dist",
    "coverage",
    "node_modules",
    ".turbo",
    ".vitest",
    ".bench",
    // ❌ DO NOT ADD "tests/**" - tests MUST be in sandbox!
  ],

  // Incremental mode (cache results)
  incremental: true,
  incrementalFile: ".stryker-tmp/incremental.json",

  // Clean temp dir between runs
  cleanTempDir: true,
};
