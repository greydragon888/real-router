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

// #1065 migration (direction-tracker vertical slice): react owns the coverage of
// shared/dom-utils/direction-tracker.ts. No adapter wires the tracker — it must be
// installed before `usePlugin(browserPlugin)` (see direction-tracker.ts listener-
// ordering note + #545), so it cannot be integration-tested; its white-box test
// lives in this suite (tests/functional/direction-tracker.test.ts). `allowExternal`
// + the explicit include let react's coverage gate the symlinked shared file.
// Include is narrowed to react's OWN src: the inherited base `packages/*/src/**`
// would, under `allowExternal`, also measure core/sources src that react's tests
// execute (via the internal-source condition) but do not fully cover.
config.test.coverage.allowExternal = true;
config.test.coverage.include = [
  "packages/react/src/**/*.ts",
  "packages/react/src/**/*.tsx",
  "**/shared/dom-utils/direction-tracker.ts",
];

export default config;
