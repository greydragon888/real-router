import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";
import codspeedPlugin from "@codspeed/vitest-plugin";

/**
 * Auto-generate resolve aliases from workspace packages.
 * Maps package names to their src/ entry points so Vitest
 * runs tests against source (for v8 coverage on src/**).
 *
 * Replaces the "development" export condition which was removed
 * from package.json exports because Vite resolves it by default
 * and errors for external consumers (#421).
 */
function workspaceSourceAliases(): Record<string, string> {
  const root = dirname(fileURLToPath(import.meta.url));
  const packagesDir = join(root, "packages");
  const aliases: Record<string, string> = {};

  for (const dir of readdirSync(packagesDir, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;

    const pkgPath = join(packagesDir, dir.name, "package.json");
    if (!existsSync(pkgPath)) continue;

    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    if (!pkg.exports) continue;

    for (const [subpath, conditions] of Object.entries(pkg.exports)) {
      if (typeof conditions !== "object" || !conditions) continue;
      const cond = conditions as Record<string, unknown>;

      // Prefer the new "@real-router/internal-source" custom condition if present,
      // otherwise fall back to deriving from the ESM dist path.
      const sourceCondition = cond["@real-router/internal-source"];
      const importPath = (cond.import as string) || "";

      let srcFileCandidates: string[] = [];
      if (typeof sourceCondition === "string") {
        srcFileCandidates = [sourceCondition];
      } else if (importPath) {
        const stripped = importPath
          .replace(/^\.\/dist\/esm\//, "./src/")
          .replace(/\.mjs$/, "");
        srcFileCandidates = [
          `${stripped}.ts`,
          `${stripped}.tsx`,
          `${stripped}/index.ts`,
          `${stripped}/index.tsx`,
        ];
      }

      let fullSrcPath: string | null = null;
      for (const candidate of srcFileCandidates) {
        const absolute = join(packagesDir, dir.name, candidate);
        if (existsSync(absolute)) {
          fullSrcPath = absolute;
          break;
        }
      }

      if (!fullSrcPath) continue;

      const name =
        subpath === "." ? pkg.name : `${pkg.name}/${subpath.slice(2)}`;
      aliases[name] = fullSrcPath;
    }
  }

  // Sort by key length descending — longer (more specific) paths first.
  // Vite alias with string keys matches by prefix, so "@real-router/core"
  // would intercept "@real-router/core/api" if it comes first.
  const sorted: Record<string, string> = {};
  for (const key of Object.keys(aliases).sort((a, b) => b.length - a.length)) {
    sorted[key] = aliases[key];
  }

  return sorted;
}

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

  // Resolve workspace packages to source for test coverage.
  // Without this, Vitest resolves via exports → dist and v8
  // coverage can't track source files.
  //
  // NOTE (Этап 2 RFC): Vitest condition-based resolution with custom
  // "@real-router/internal-source" condition will be added here once we identify a
  // condition list that doesn't interfere with external packages (preact,
  // react, vue, svelte) which use non-standard condition orderings. For now
  // we keep the alias-based approach and rely on the tsconfig's customConditions
  // for TypeScript-side resolution. See .claude/rfc-custom-export-condition-root-fix-ru.md
  resolve: {
    alias: workspaceSourceAliases(),
  },

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
     * Packages can override this (e.g., react-real-router uses jsdom)
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
