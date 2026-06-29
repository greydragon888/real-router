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
        // Ratcheted from 94/84/94/94 after the git-tracked dom-utils copy
        // suites were brought up to 100% statements (route-announcer +
        // view-transitions also reach 100% branches; scroll-spy / scroll-restore
        // 100% statements). The signal-input directives (RealLink / RouteView /
        // …) keep a JIT ceiling — see CLAUDE.md "Coverage Ceiling" — so the
        // global floor stays below 100%. These are the measured floors, locked
        // to catch regressions (actual: 97.35 / 93.27 / 98.74 / 97.3).
        thresholds: {
          statements: 97,
          branches: 93,
          functions: 98,
          lines: 97,
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
