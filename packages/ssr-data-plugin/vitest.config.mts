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

// #809 — this package is the coverage owner of shared/ssr.
// Unlike shared/dom-utils and shared/browser-env, shared/ssr has no dedicated
// owner package (both consumers have their own src), so the measurement rides
// on this consumer: v8 resolves the `src/shared-ssr` symlink to its
// `shared/ssr` realpath, which the base `packages/*/src/**` include drops —
// without this block the shared sources were measured nowhere.
// `allowExternal: true` keeps files outside the package root, and the include
// must be REPLACED with the two specific paths (not concatenated with the
// base wildcard): a bare `packages/*/src/**` alongside allowExternal would
// drag the whole aliased workspace graph (core, fsm, …) into the report.
config.test.coverage.allowExternal = true;
config.test.coverage.include = [
  "**/packages/ssr-data-plugin/src/**/*.ts",
  "**/shared/ssr/**/*.ts",
];

export default config;
