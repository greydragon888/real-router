import { mergeConfig, defineProject } from "vitest/config";
import unitConfig from "../vitest.config.unit.mjs";

/**
 * Unit config for the shared test node (#1065). Runs the aggregated unit +
 * functional tests of shared/browser-env and shared/dom-utils that used to live
 * in the `packages/browser-env` / `packages/dom-utils` tests-only wrappers.
 * jsdom: both modules early-return NOOPs without a DOM.
 */
const config = mergeConfig(
  unitConfig,
  defineProject({
    test: {
      environment: "jsdom",
      setupFiles: "./tests/setup.ts",
    },
  }),
);

// Tests live by module under tests/<dir>/<subdir>/ (outside the symlinked
// shared/<dir>/ so consumers never re-discover them — #1065 §4). The base
// `**/tests/unit/**` glob does not match that layout, so REPLACE include.
config.test.include = ["tests/**/*.test.ts?(x)"];

// #809 / #1065 — this node owns the aggregated 100% coverage of shared/browser-env.
// (shared/dom-utils moved to packages/react under the node -> consumer host
// migration.) `allowExternal` + the literal `**/shared/browser-env/**` form are
// required (the latter is grepped by scripts/check-coverage-scope.mjs to find the
// owner).
config.test.coverage.allowExternal = true;
config.test.coverage.include = ["**/shared/browser-env/**/*.ts"];
config.test.coverage.thresholds = {
  statements: 100,
  branches: 100,
  functions: 100,
  lines: 100,
};

export default config;
