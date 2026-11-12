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

// react measures the whole shared/dom-utils tree; its white-box tests live under
// tests/{functional,property,stress}/dom-utils/. `allowExternal` admits files
// outside the package root. The `src/**` entries name react's own sources and
// leave out the core and sources files its tests execute (via the
// internal-source condition) but do not fully cover. The shared entry starts at
// the package root, because Vitest globs `include` from there to report a file
// no test loads (IMPLEMENTATION_NOTES "An owner reports the shared files no test
// loads"). scripts/check-coverage-scope.mjs identifies the dom-utils owner by
// the `../../shared/dom-utils/` entry.
config.test.coverage.allowExternal = true;
config.test.coverage.include = [
  "src/**/*.ts",
  "src/**/*.tsx",
  "../../shared/dom-utils/**/*.ts",
];

export default config;
