import { defineConfig } from "vitest/config";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Vitest конфигурация для Stryker mutation testing
 * Router6-plugin-logger зависит от logger, router6, router6-types
 *
 * КРИТИЧНО: относительный путь для ЭТОГО пакета, absolute для dependencies!
 * - router6-plugin-logger: ./modules (мутированный код в sandbox)
 * - workspace deps: абсолютные пути к ОРИГИНАЛЬНОМУ коду
 */
export default defineConfig({
  cacheDir: "./.vitest-stryker",

  // Resolve workspace package imports to local modules
  resolve: {
    alias: {
      // THIS package: relative = sandbox mutated code
      "router6-plugin-logger": resolve(__dirname, "./modules/index.ts"),
      // Workspace deps: ABSOLUTE = original unmutated code (work!)
      logger:
        "/Users/olegivanov/WebstormProjects/router6/packages/logger/modules/index.ts",
      router5:
        "/Users/olegivanov/WebstormProjects/router6/packages/router5/modules/index.ts",
      "router5-types":
        "/Users/olegivanov/WebstormProjects/router6/packages/router5-types/modules/index.ts",
    },
  },

  test: {
    clearMocks: true,
    globals: true,
    environment: "node",
    reporters: ["dot"], // Minimal reporter for speed
    watch: false,

    // Оптимизированные таймауты
    testTimeout: 5000, // 5s per test
    hookTimeout: 5000, // 5s per hook

    // Include test files
    include: ["./tests/**/*.test.ts"],

    // Optimize memory usage
    pool: "forks",
    isolate: true,
  },
});
