import { mergeConfig, defineProject } from "vitest/config";
import unitConfig from "../../vitest.config.unit.mjs";

/**
 * Vitest configuration for browser-plugin package
 * Extends root unit config with jsdom environment for browser API testing
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

// #1065 migration (node -> consumer host): browser-plugin owns the aggregated 100%
// coverage of the whole shared/browser-env tree. The white-box unit tests that used
// to live in the shared test node now live under tests/{functional,property}/
// browser-env/; browser-plugin's coverage gates the symlinked shared files.
// `allowExternal` admits the external symlink target; the include is narrowed to
// browser-plugin's OWN src — the inherited base `packages/*/src/**` would, under
// `allowExternal`, also measure core src the plugin's tests execute (via the
// internal-source condition) but do not fully cover. The literal
// `**/shared/browser-env/**` form is grepped by scripts/check-coverage-scope.mjs to
// identify browser-plugin as the browser-env owner.
config.test.coverage.allowExternal = true;
// #1838: the base config excludes `**/index.ts` (package barrels are pure
// re-exports), and the owner configs replace `include` but inherit `exclude` —
// so all three `shared/*/index.ts` were measured NOWHERE. Proven on the
// dom-utils owner: a never-called function with a branch appended to
// `shared/dom-utils/index.ts` left react at 100% statements AND branches, exit
// 0; with this narrowing the same plant fails the gate. Barrels are pure
// re-exports today, so the cost is zero — nothing holds them that way.
config.test.coverage.exclude = [
  ...config.test.coverage.exclude.filter((p) => p !== "**/index.ts"),
  "packages/**/index.ts",
];
config.test.coverage.include = [
  "packages/browser-plugin/src/**/*.ts",
  "**/shared/browser-env/**/*.ts",
];

export default config;
