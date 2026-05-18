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
        // `src/dom-utils/direction-tracker.ts` is no longer excluded —
        // `tests/functional/direction-tracker.test.ts` now covers all
        // branches (review-2026-05-10 §5.5 КРИТИЧНО gap closed). See
        // also `tests/stress/direction-tracker-popstate.stress.ts` for
        // at-scale coverage (50 popstate × 100 navs, 100 install/destroy
        // cycles).
      },
    },
  }),
);
