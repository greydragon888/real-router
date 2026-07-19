import { mergeConfig, defineConfig } from "vitest/config";
import { commonConfig } from "../../vitest.config.common.mjs";

/**
 * Vitest configuration for stress tests (validation-plugin package)
 *
 * Robustness / DoS-resistance + ReDoS sentinels for the type-guard machinery
 * dissolved here in M1 (`isParams`, `isRouteName`, `validateRouteName`). Node
 * environment (no browser APIs); coverage disabled (stress guards timing/no-crash,
 * not lines); forks pool for isolation of the large-allocation runs.
 */
export default mergeConfig(
  commonConfig,
  defineConfig({
    test: {
      environment: "node",
      include: ["./tests/stress/**/*.stress.ts"],
      coverage: { enabled: false },
      pool: "forks",
      maxWorkers: 2,
      testTimeout: 30000,
      hookTimeout: 15000,
    },
  }),
);
