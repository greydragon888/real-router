import { mergeConfig, defineConfig } from "vitest/config";
import solidPlugin from "vite-plugin-solid";
import unitConfig from "../../vitest.config.unit.mjs";

export default mergeConfig(
  unitConfig,
  defineConfig({
    plugins: [solidPlugin()],
    test: {
      environment: "jsdom",
      include: ["./tests/**/*.test.ts?(x)"],
      setupFiles: "./tests/setup.ts",
      coverage: {
        thresholds: {
          branches: 90,
        },
      },
    },
    resolve: {
      conditions: ["development", "browser"],
    },
  }),
);
