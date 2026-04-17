import { mergeConfig, defineConfig } from "vitest/config";
import unitConfig from "../../vitest.config.unit.mjs";

export default mergeConfig(
  unitConfig,
  defineConfig({
    test: {
      environment: "jsdom",
      include: ["./tests/**/*.test.ts"],
      setupFiles: "./tests/setup.ts",
      coverage: {
        thresholds: {
          statements: 94,
          branches: 84,
          functions: 94,
          lines: 94,
        },
      },
    },
  }),
);
