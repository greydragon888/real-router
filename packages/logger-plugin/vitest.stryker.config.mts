import { defineConfig } from "vitest/config";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Vitest configuration for Stryker mutation testing
 * @real-router/logger-plugin depends on @real-router/core, which is where the
 * logger and its types live
 *
 * CRITICAL: an alias for THIS package, the condition for dependencies!
 * - @real-router/logger-plugin: ./src (mutated code in sandbox)
 * - workspace deps: ORIGINAL src, through the condition under `ssr`
 */
export default defineConfig({
  cacheDir: "./.vitest-stryker",

  // Resolve workspace package imports to local src
  resolve: {
    alias: {
      // THIS package: relative = sandbox mutated code
      "@real-router/logger-plugin": resolve(__dirname, "./src/index.ts"),
    },
  },

  // Under `ssr`, not `resolve`: Vitest runs `environment: "node"` in Vite's ssr
  // environment, and Vite gives a root `resolve.conditions` to the client
  // environment alone.
  ssr: {
    resolve: {
      // Resolve workspace deps to their src via the internal-source export
      // condition (sandbox node_modules symlinks → original src); do NOT add
      // manual aliases for deps — they break vitest's module dedup and the
      // package's own barrel-reached code loses Stryker mutant activation.
      conditions: ["@real-router/internal-source", "import", "node"],
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

    isolate: true,
  },
});
