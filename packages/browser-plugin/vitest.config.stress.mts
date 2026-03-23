import { mergeConfig, defineConfig } from "vitest/config";
import { commonConfig } from "../../vitest.config.common.mjs";

export default mergeConfig(
  commonConfig,
  defineConfig({
    test: {
      environment: "jsdom",
      include: ["./tests/stress/**/*.stress.ts"],
      setupFiles: "./tests/setup.ts",
      coverage: { enabled: false },
      pool: "forks",
      execArgv: ["--expose-gc"],
      maxWorkers: 2,
      testTimeout: 30000,
      hookTimeout: 15000,
    },
  }),
);
