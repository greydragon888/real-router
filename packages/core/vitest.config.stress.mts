import { mergeConfig, defineConfig } from "vitest/config";
import { commonConfig } from "../../vitest.config.common.mjs";

export default mergeConfig(
  commonConfig,
  defineConfig({
    test: {
      environment: "node",
      include: ["./tests/stress/**/*.stress.ts"],
      setupFiles: ["./tests/setup.ts"],
      coverage: { enabled: false },
      pool: "forks",
      // --expose-gc enables global.gc() for heap measurements
      execArgv: ["--expose-gc"],
      maxWorkers: 2,
      testTimeout: 60000,
      hookTimeout: 15000,
    },
  }),
);
