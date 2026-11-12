import { mergeConfig, defineProject } from "vitest/config";
import unitConfig from "../../vitest.config.unit.mjs";

/**
 * Vitest configuration for data-loader-plugin package
 * Extends root unit config with Node.js environment
 */
const config = mergeConfig(
  unitConfig,
  defineProject({
    test: {
      environment: "node",
    },
  }),
);

// This package measures the whole shared/ssr tree, which rsc-server-plugin
// links too. v8 reports the `src/shared-ssr` symlink by its `shared/ssr`
// realpath, outside the package root: `allowExternal` admits it. `src/**/*.ts`
// names this package's own sources and leaves out the workspace packages its
// tests load (core among them). The shared entry starts at the package root,
// because Vitest globs `include` from there to report a file no test loads
// (IMPLEMENTATION_NOTES "An owner reports the shared files no test loads").
// scripts/check-coverage-scope.mjs identifies the ssr owner by the
// `../../shared/ssr/` entry.
config.test.coverage.allowExternal = true;
config.test.coverage.include = ["src/**/*.ts", "../../shared/ssr/**/*.ts"];

export default config;
