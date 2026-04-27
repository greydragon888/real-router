import { mergeConfig, defineConfig } from "vitest/config";
import unitConfig from "../../vitest.config.unit.mjs";

export default mergeConfig(
  unitConfig,
  defineConfig({
    test: {
      environment: "jsdom",
      include: ["./tests/**/*.test.ts"],
      setupFiles: "./tests/setup.ts",
      coverage: {
        thresholds: {
          statements: 94,
          branches: 84,
          functions: 94,
          lines: 94,
        },
        exclude: [
          // Optional user-facing utility — git-tracked copy of
          // `shared/dom-utils/direction-tracker.ts`. Coverage lives in
          // `packages/dom-utils/tests/functional/`; Angular's adapter
          // doesn't import it from `providers.ts`, so it isn't
          // reachable through the package's own test suite.
          "src/dom-utils/direction-tracker.ts",
        ],
      },
    },
  }),
);
