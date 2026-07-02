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

// #809 / #1065 — this node owns the aggregated 100% coverage of shared/be+du.
// `allowExternal` + the literal `**/shared/<dir>/**` form are required (the
// latter is grepped by scripts/check-coverage-scope.mjs to find the owner).
config.test.coverage.allowExternal = true;
config.test.coverage.include = [
  "**/shared/browser-env/**/*.ts",
  "**/shared/dom-utils/**/*.ts",
];
config.test.coverage.thresholds = {
  statements: 100,
  branches: 100,
  functions: 100,
  lines: 100,
};

// #1065 migration (direction-tracker vertical slice): the coverage of
// shared/dom-utils/direction-tracker.ts moved to packages/react — no adapter wires
// the tracker (it must be installed before `usePlugin`; see #545), so it cannot be
// integration-tested and its white-box test now lives in the react suite, whose
// coverage gates it. Exclude it here so this node no longer owns it. The cross-util
// lifecycle property/stress tests still exercise it as one participant, but this
// unit gate no longer counts it.
config.test.coverage.exclude = [
  ...config.test.coverage.exclude,
  "**/shared/dom-utils/direction-tracker.ts",
];

export default config;
