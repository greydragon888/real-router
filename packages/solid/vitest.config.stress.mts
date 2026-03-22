import { mergeConfig, defineConfig } from "vitest/config";
import { commonConfig } from "../../vitest.config.common.mjs";
import solidPlugin from "vite-plugin-solid";

export default mergeConfig(
  commonConfig,
  defineConfig({
    plugins: [solidPlugin()],
    test: {
      environment: "jsdom",
      include: ["./tests/stress/**/*.stress.tsx"],
      setupFiles: "./tests/setup.ts",
      coverage: { enabled: false },
      pool: "forks",
      maxWorkers: 2,
      testTimeout: 60000,
      hookTimeout: 15000,
    },
  }),
);
