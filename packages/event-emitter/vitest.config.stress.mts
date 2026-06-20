import { mergeConfig, defineConfig } from "vitest/config";

import { commonConfig } from "../../vitest.config.common.mjs";

/**
 * Vitest configuration for heap-stress tests (event-emitter package).
 *
 * --expose-gc enables global.gc() for deterministic heap measurements.
 */
export default mergeConfig(
  commonConfig,
  defineConfig({
    test: {
      environment: "node",
      include: ["./tests/stress/**/*.stress.ts"],
      coverage: { enabled: false },
      pool: "forks",
      execArgv: ["--expose-gc"],
      maxWorkers: 2,
      testTimeout: 30_000,
      hookTimeout: 15_000,
    },
  }),
);
