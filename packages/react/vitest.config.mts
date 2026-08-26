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
// #1838: the base config excludes `**/index.ts` (package barrels are pure
// re-exports), and the owner configs replace `include` but inherit `exclude` —
// so all three `shared/*/index.ts` were measured NOWHERE. Proven: a never-called
// function with a branch appended to `shared/dom-utils/index.ts` left react at
// 100% statements AND branches, exit 0. Narrow the exclusion to package barrels
// so the shared barrel is gated like every other shared file.
config.test.coverage.exclude = [
  ...config.test.coverage.exclude.filter((p) => p !== "**/index.ts"),
  "packages/**/index.ts",
];
config.test.coverage.include = [
  "packages/react/src/**/*.ts",
  "packages/react/src/**/*.tsx",
  "**/shared/dom-utils/**/*.ts",
];

export default config;
