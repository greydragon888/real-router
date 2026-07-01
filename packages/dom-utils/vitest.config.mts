import { mergeConfig, defineProject } from "vitest/config";
import unitConfig from "../../vitest.config.unit.mjs";

const config = mergeConfig(
  unitConfig,
  defineProject({
    test: {
      environment: "jsdom",
    },
  }),
);

// #809 — owner-measured coverage for shared/dom-utils.
// v8 resolves the `src` symlink to its `shared/dom-utils` realpath, which the
// base `packages/*/src/**` include drops and `allowExternal: false` excludes —
// so this package's 100% thresholds passed vacuously over zero files.
// `allowExternal: true` lets v8 keep files outside the package root, and the
// include must be REPLACED (not concatenated): keeping the base
// `packages/*/src/**` alongside allowExternal would drag the whole aliased
// workspace graph (core, fsm, …) into the report.
config.test.coverage.allowExternal = true;
config.test.coverage.include = ["**/shared/dom-utils/**/*.ts"];

// Pin the project's 100% standard explicitly on the shared/dom-utils sources.
// The base unit config already sets 100/100/100/100, but these symlinked
// sources are the canonical coverage of the six adapters' dom-utils (the
// adapter suites only re-cover their own copies), so the floor is restated here
// to keep it independent of any future base-config drift.
config.test.coverage.thresholds = {
  statements: 100,
  branches: 100,
  functions: 100,
  lines: 100,
};

export default config;
