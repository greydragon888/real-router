import { mergeConfig, defineConfig } from "vitest/config";
import { commonConfig } from "../../vitest.config.common.mjs";

/**
 * Stress config for the reactive dom-utils lifecycle teardown tests.
 *
 * jsdom (not node): the utilities under test (createRouteAnnouncer,
 * createScrollRestoration, createScrollSpy, createDirectionTracker) early-return
 * a NOOP when `window`/`document` are undefined, so a node environment would
 * exercise nothing. Coverage is disabled — these are leak/throughput guards,
 * not coverage contributors.
 */
export default mergeConfig(
  commonConfig,
  defineConfig({
    test: {
      environment: "jsdom",
      include: ["./tests/stress/**/*.stress.ts"],
      coverage: { enabled: false },
      pool: "forks",
      execArgv: ["--expose-gc"],
      maxWorkers: 2,
      testTimeout: 60000,
      hookTimeout: 15000,
    },
  }),
);
