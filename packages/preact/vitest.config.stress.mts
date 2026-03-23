import { mergeConfig, defineConfig } from "vitest/config";
import { commonConfig } from "../../vitest.config.common.mjs";

export default mergeConfig(
  commonConfig,
  defineConfig({
    test: {
      environment: "jsdom",
      include: ["./tests/stress/**/*.stress.tsx"],
      setupFiles: "./tests/setup.ts",
      coverage: { enabled: false },
      pool: "forks",
      execArgv: ["--expose-gc"],
      maxWorkers: 2,
      testTimeout: 60000,
      hookTimeout: 15000,
    },
  }),
);
