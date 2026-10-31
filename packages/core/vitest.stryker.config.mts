import { defineConfig } from "vitest/config";
import { existsSync, globSync, readFileSync } from "node:fs";
import path from "node:path";

const TESTS = path.resolve(import.meta.dirname, "./tests");

/** The suite's own module a relative specifier names, if it names one. */
const suiteModule = (from: string, specifier: string): string | undefined => {
  const stem = path.resolve(path.dirname(from), specifier.replace(/\.js$/, ""));

  return [`${stem}.ts`, `${stem}.tsx`, `${stem}/index.ts`].find(
    (candidate) => candidate.startsWith(TESTS) && existsSync(candidate),
  );
};

/**
 * ⚑ **A test that reads SOURCE TEXT cannot run in the Stryker sandbox, and it
 * fails in the shape that takes the whole RUN down rather than one mutant.**
 * Stryker copies the package alone into a temp tree and instruments `src`, so
 * such a test sees neither the tree nor the text it expects — and the failure
 * lands in the DRY RUN, before a single mutant is tested.
 *
 * ⚠ **Derived, never listed.** A hand-kept list would be a second copy that
 * drifts on the next scan added; the predicate below is what makes a test a
 * reader.
 *
 * ⚠ **The cost is named rather than hidden.** A file that MIXES a source scan
 * with behavioural cells loses both, so its behavioural cells contribute no
 * mutation signal — the reason to keep a scan in its own file.
 *
 * ⚠ **Reading through the suite's own helper is reading.** The predicate follows
 * value imports, so a helper that reads takes every importer with it — the
 * reason to keep one out of a module behavioural tests import.
 */
const readsSource = (file: string, seen = new Set<string>()): boolean => {
  if (seen.has(file)) {
    return false;
  }

  seen.add(file);

  const text = readFileSync(file, "utf8");

  return (
    /\b(readFileSync|globSync)\b/.test(text) ||
    [
      ...text.matchAll(/^(?:import|export) (?!type\b)[^;]*?from "(\.[^"]+)"/gm),
    ].some(([, specifier]) => {
      const target = suiteModule(file, specifier);

      return target !== undefined && readsSource(target, seen);
    })
  );
};

const sourceScanningTests = globSync("**/*.test.{ts,tsx}", { cwd: TESTS })
  .filter((file) => readsSource(path.resolve(TESTS, file)))
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

    isolate: true,

    // Minimal reporter for speed
    reporters: ["dot"],
  },
});
