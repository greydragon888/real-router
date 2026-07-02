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
config.test.coverage.include = [
  "packages/browser-plugin/src/**/*.ts",
  "**/shared/browser-env/**/*.ts",
];

export default config;
