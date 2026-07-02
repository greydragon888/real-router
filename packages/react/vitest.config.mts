import { mergeConfig, defineProject } from "vitest/config";
import unitConfig from "../../vitest.config.unit.mjs";

/**
 * Vitest configuration for react-real-router package
 * Extends root unit config with jsdom environment for React testing
 */
const config = mergeConfig(
  unitConfig,
  defineProject({
    test: {
      environment: "jsdom",
      include: ["./tests/**/*.test.ts?(x)"],
      setupFiles: "./tests/setup.ts",
    },
  }),
);

// #1065 migration (node -> consumer host): react owns the aggregated 100% coverage
// of the whole shared/dom-utils tree. The white-box unit tests that used to live in
// the shared test node now live under tests/{functional,property,stress}/dom-utils/;
// react's coverage gates the symlinked shared files. `allowExternal` admits the
// external symlink target; the include is narrowed to react's OWN src — the inherited
// base `packages/*/src/**` would, under `allowExternal`, also measure core/sources
// src that react's tests execute (via the internal-source condition) but do not fully
// cover. The literal `**/shared/dom-utils/**` form is grepped by
// scripts/check-coverage-scope.mjs to identify react as the dom-utils owner.
config.test.coverage.allowExternal = true;
config.test.coverage.include = [
  "packages/react/src/**/*.ts",
  "packages/react/src/**/*.tsx",
  "**/shared/dom-utils/**/*.ts",
];

export default config;
