import { defineConfig } from "vitest/config";
import { globSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * ⚑ **A test that reads SOURCE TEXT cannot run in the Stryker sandbox, and it
 * fails in the shape that takes the whole RUN down rather than one mutant.**
 * Stryker copies the package alone into a temp tree and instruments `src`, so
 * such a test sees neither the tree nor the text it expects — and the failure
 * lands in the DRY RUN, before a single mutant is tested.
 *
 * ⚠ **Derived, never listed.** A hand-kept list would be a second copy that
 * drifts on the next scan added; the predicate below is what makes a test a
 * reader. IMPLEMENTATION_NOTES "Stryker on core reached zero mutants" owns the
 * counts and the two failure shapes.
 *
 * ⚠ **The cost is named rather than hidden.** A file that MIXES a source scan
 * with behavioural cells loses both, so its behavioural cells contribute no
 * mutation signal — the reason to keep a scan in its own file.
 */
const sourceScanningTests = globSync("**/*.test.{ts,tsx}", {
  cwd: path.resolve(import.meta.dirname, "./tests"),
})
  .filter((file) =>
    /\b(readFileSync|globSync)\b/.test(
      readFileSync(path.resolve(import.meta.dirname, "./tests", file), "utf8"),
    ),
  )
  .map((file) => `./tests/${file}`);

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
      // (Former `engine` / `logger` workspace aliases removed — both folded into
      // core: engine → src/engine (engine-merge iteration 2), logger →
      // src/utils/logger (wave-1b). Nothing imports them bare anymore.)
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
    exclude: [
      "node_modules",
      "dist",
      ".idea",
      ".git",
      ".cache",
      "coverage",
      ...sourceScanningTests,
    ],

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
