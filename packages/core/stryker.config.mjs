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
    "src/**/*.ts",
    "!src/index.ts", // Barrel export - skip
    "!src/internals.ts", // Internal re-exports - skip
    "!src/constants.ts", // Constants - skip
    // Engine (folded in at src/engine, engine-merge iteration 2) — the same
    // barrel/type-only excludes the standalone engine's stryker config carried,
    // re-scoped src/ → src/engine/ (mutants on re-export barrels + type-only
    // files are equivalents; engine held ~90% without them).
    "!src/engine/index.ts", // Engine barrel - skip
    "!src/engine/types.ts", // Type re-export hub - skip
    "!src/engine/builder/index.ts", // Barrel - skip
    "!src/engine/builder/types.ts", // Type-only - skip
    "!src/engine/operations/types.ts", // Type-only - skip
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
  // "json" emits the machine-readable mutation-testing-report-schema as a plain
  // JSON file — parse it directly (jq/node) instead of eval-extracting the blob
  // embedded in the multi-MB HTML report.
  reporters: ["progress", "clear-text", "html", "json", "dashboard"],
  // Stryker Dashboard upload (badge). API key via STRYKER_DASHBOARD_API_KEY env.
  // version "master" → badge tracks master; run mutation on master to publish.
  dashboard: {
    project: "github.com/greydragon888/real-router",
    version: "master",
    module: "core",
  },
  htmlReporter: {
    fileName: "reports/mutation-report.html",
  },
  jsonReporter: {
    fileName: "reports/mutation-report.json",
  },
  // skipFull hides 100%-killed files so the clear-text tail lists only files
  // that still have survivors; reportMutants prints each survivor inline.
  clearTextReporter: {
    reportMutants: true,
    skipFull: true,
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
