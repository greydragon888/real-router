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

// browser-plugin measures the whole shared/browser-env tree; its white-box tests
// live under tests/{functional,property}/browser-env/. `allowExternal` admits
// files outside the package root. `src/**/*.ts` names the plugin's own sources
// and leaves out the core files its tests execute (via the internal-source
// condition) but do not fully cover. The shared entry starts at the package
// root, because Vitest globs `include` from there to report a file no test
// loads (IMPLEMENTATION_NOTES "An owner reports the shared files no test
// loads"). scripts/check-coverage-scope.mjs identifies the browser-env owner by
// the `../../shared/browser-env/` entry.
config.test.coverage.allowExternal = true;
config.test.coverage.include = [
  "src/**/*.ts",
  "../../shared/browser-env/**/*.ts",
];

export default config;
