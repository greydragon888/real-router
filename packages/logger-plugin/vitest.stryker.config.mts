import { defineConfig } from "vitest/config";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Vitest configuration for Stryker mutation testing
 * @real-router/logger-plugin depends on logger, @real-router/core, core-types
 *
 * CRITICAL: relative path for THIS package, absolute for dependencies!
 * - @real-router/logger-plugin: ./src (mutated code in sandbox)
 * - workspace deps: absolute paths to ORIGINAL code
 */
export default defineConfig({
  cacheDir: "./.vitest-stryker",

  // Resolve workspace package imports to local src
  resolve: {
    alias: {
      // THIS package: relative = sandbox mutated code
      "@real-router/logger-plugin": resolve(__dirname, "./src/index.ts"),
      // Workspace deps: ABSOLUTE = original unmutated code (work!)
      logger:
        "/Users/olegivanov/WebstormProjects/real-router/packages/logger/src/index.ts",
      "@real-router/core":
        "/Users/olegivanov/WebstormProjects/real-router/packages/core/src/index.ts",
      "core-types":
        "/Users/olegivanov/WebstormProjects/real-router/packages/core-types/src/index.ts",
    },
  },

  test: {
    clearMocks: true,
    globals: true,
    environment: "node",
    reporters: ["dot"], // Minimal reporter for speed
    watch: false,

    // Optimized timeouts
    testTimeout: 5000, // 5s per test
    hookTimeout: 5000, // 5s per hook

    // Include test files
    include: ["./tests/**/*.test.ts"],

    // Optimize memory usage
    pool: "forks",
    isolate: true,
  },
});
