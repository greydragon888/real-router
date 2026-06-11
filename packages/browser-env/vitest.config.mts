import { mergeConfig, defineProject } from "vitest/config";
import unitConfig from "../../vitest.config.unit.mjs";

const config = mergeConfig(
  unitConfig,
  defineProject({
    test: {
      environment: "jsdom",
      setupFiles: "./tests/setup.ts",
    },
  }),
);

// #809 — owner-measured coverage for shared/browser-env.
// v8 resolves the `src` symlink to its `shared/browser-env` realpath, which
// the base `packages/*/src/**` include drops and `allowExternal: false`
// excludes — so this package's 100% thresholds passed vacuously over zero
// files. `allowExternal: true` lets v8 keep files outside the package root,
// and the include must be REPLACED (not concatenated): keeping the base
// `packages/*/src/**` alongside allowExternal would drag the whole aliased
// workspace graph (core, fsm, …) into the report.
config.test.coverage.allowExternal = true;
config.test.coverage.include = ["**/shared/browser-env/**/*.ts"];

export default config;
