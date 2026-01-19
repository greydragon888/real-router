/**
 * Stryker mutation testing configuration for real-router
 *
 * Standalone config - does not extend base to avoid sandbox resolution issues.
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  packageManager: "pnpm",
  testRunner: "vitest",
  checkers: ["typescript"],

  // Explicitly load plugins (required for pnpm strict node_modules)
  plugins: [
    "@stryker-mutator/vitest-runner",
    "@stryker-mutator/typescript-checker",
  ],

  // Mutate real-router source files
  mutate: [
    "modules/**/*.ts",
    "!modules/index.ts", // Barrel export - skip
    "!modules/internals.ts", // Internal re-exports - skip
    "!modules/constants.ts", // Constants - skip
  ],

  // Vitest runner configuration
  vitest: {
    configFile: "vitest.stryker.config.mts",
    related: false, // Disable related test detection (barrel export issue)
  },

  // Coverage analysis - perTest for optimal mutation testing
  coverageAnalysis: "perTest",

  // Local tsconfig
  tsconfigFile: "tsconfig.json",

  // Mutation score thresholds
  thresholds: {
    high: 90,
    low: 80,
    break: 70,
  },

  // Performance settings
  concurrency: 2, // 2 parallel processes
  timeoutMS: 10000, // 10s timeout
  timeoutFactor: 3, // 3x safety margin

  // Reporters
  reporters: ["progress", "clear-text", "html"],
  htmlReporter: {
    fileName: "reports/mutation-report.html",
  },

  // DO NOT exclude tests/ - they are needed in sandbox!
  ignorePatterns: [
    "dist",
    "coverage",
    "node_modules",
    ".turbo",
    ".vitest",
    ".bench",
  ],

  // Incremental mode (cache results between runs)
  incremental: true,
  incrementalFile: ".stryker-tmp/incremental.json",

  // Clean temp dir between runs
  cleanTempDir: true,

  // Strict type checking for each mutant
  disableTypeChecks: false,

  // Fresh runner for each mutant (matches vitest-react-profiler)
  maxTestRunnerReuse: 0,
};
