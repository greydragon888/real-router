import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

import { defineConfig, mergeConfig } from "vitest/config";
import { commonConfig } from "./vitest.config.common.mjs";

/**
 * The `src/<alias>` directories of the package being tested that are SYMLINKS
 * into `shared/`, as coverage-exclude globs.
 *
 * ⚠ Computed from the filesystem rather than listed, because the aliases are
 * not interchangeable: `src/dom-utils` is a symlink in `preact`/`solid`/
 * `svelte`/`vue` and a git-tracked COPY in `angular` (ng-packagr does not follow
 * symlinks — see CLAUDE.md). A hard-coded `src/dom-utils/**` therefore deletes
 * 606 statements of Angular's OWN source from its report; measured, that took it
 * from 1027 statements at 99.02 % to 421 at 97.86 % and failed its thresholds.
 *
 * Why exclude them at all: each shared dir is measured once, by the owner
 * package that re-includes it through its real `shared/<dir>/**` path under
 * `coverage.allowExternal` — a form this exclusion does not touch. Without it a
 * root-relative `src/**` include walks into the symlink and every consumer
 * measures sources it does not own (`navigation-plugin`: 268 statements → 687 at
 * 39 %). `lint:coverage-scope` owns the one-owner-per-shared-dir rule.
 */
function symlinkedSharedDirs(): string[] {
  const src = join(process.cwd(), "src");

  if (!existsSync(src)) return [];

  return readdirSync(src, { withFileTypes: true })
    .filter((entry) => entry.isSymbolicLink())
    .map((entry) => `src/${entry.name}/**`);
}

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
        // ⚠ Root-RELATIVE, and that is load-bearing rather than tidy. Every
        // package runs `vitest` from its own directory, so the coverage root is
        // `packages/<pkg>` and the real paths are `src/**`. A `packages/*/src/**`
        // glob only ever matched them through Vitest 4's loose "contains"
        // matching; Vitest 5 matches strictly against the root, where it matches
        // NOTHING — measured, 16 packages dropped to 0/0 with the 100 % thresholds
        // passing vacuously and `lcov.info` empty at 0 bytes.
        include: ["src/**/*.ts", "src/**/*.tsx"],
        exclude: [
          ...symlinkedSharedDirs(),
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
          // Legacy core files (replaced by namespaces, kept for test compatibility)
          "**/core/dependencies.ts",
          "**/core/middleware.ts",
          "**/core/navigation.ts",
          "**/core/observable.ts",
          "**/core/options.ts",
          "**/core/plugins.ts",
          "**/core/routeLifecycle.ts",
          "**/core/routerLifecycle.ts",
          "**/core/state.ts",
          "**/core/routes/**",
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
      reporters: process.env.CI ? ["dot", "github-actions"] : ["dot"],

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
       * Test tags
       * @see https://vitest.dev/guide/filtering#test-tags
       */
      tags: [
        {
          name: "slow",
          description: "Тесты >5с (navigation stress, concurrent guards)",
          timeout: 60_000,
        },
        {
          name: "performance",
          description: "Тесты производительности navigate(), matchPath()",
          timeout: 60_000,
        },
        {
          name: "flaky",
          description: "Нестабильные тесты в CI",
          retry: process.env.CI ? 3 : 0,
          timeout: 30_000,
          priority: 1,
        },
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
