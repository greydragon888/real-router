import { mergeConfig, defineConfig } from "vitest/config";
import { commonConfig } from "../vitest.config.common.mjs";

/**
 * Stress config for the shared node (#1065) — the reactive dom-utils lifecycle
 * teardown leak/throughput guards. jsdom (the utilities NOOP without a DOM).
 * Coverage disabled — these are leak/throughput guards, not coverage
 * contributors (mirrors the former packages/dom-utils/vitest.config.stress.mts).
 */
export default mergeConfig(
  commonConfig,
  defineConfig({
    test: {
      environment: "jsdom",
      include: ["tests/**/*.stress.ts"],
      coverage: { enabled: false },
      pool: "forks",
      execArgv: ["--expose-gc"],
      maxWorkers: 2,
      testTimeout: 60000,
      hookTimeout: 15000,
    },
  }),
);
