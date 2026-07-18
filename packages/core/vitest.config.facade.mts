import { mergeConfig, defineConfig } from "vitest/config";
import { commonConfig } from "../../vitest.config.common.mjs";
import unitConfig from "../../vitest.config.unit.mjs";

/**
 * Reachability-ratchet facade run for the routing engine (folded into
 * core/src/engine, #1510 / engine-merge RFC §5.5 / Appendix A).
 *
 * Measures which `src/engine/**` lines are NOT reachable from the FACADE tier
 * alone (tests/engine/functional/** — the engine public API). The layer tiers
 * (tests/engine/unit/{path-matcher,search-params}) are deliberately EXCLUDED
 * here: any src/engine line covered only by them shows up as facade-unreachable,
 * and `scripts/reachability-check.mjs` diffs that set against
 * ENGINE_REACHABILITY.json.
 *
 * Extends `commonConfig` (aliases, base excludes), NOT vitest.config.unit — a
 * mergeConfig would CONCATENATE the inherited include with the facade-only one,
 * dragging core's own tests + the engine layer tiers back in. The coverage
 * file-scope is reused from the unit config but re-scoped to `src/engine/**`;
 * the 100% thresholds are dropped (this is a measurement, not a gate).
 */
const { thresholds: _gate100, ...coverageScope } = /** @type {any} */ (
  unitConfig
).test.coverage;

export default mergeConfig(
  commonConfig,
  defineConfig({
    test: {
      environment: "node",
      setupFiles: ["./tests/setup.ts"],
      include: ["./tests/engine/functional/**/*.test.ts"],
      coverage: {
        ...coverageScope,
        enabled: true,
        include: ["packages/core/src/engine/**"],
        reporter: ["json"],
        reportsDirectory: "./coverage-facade",
      },
    },
  }),
);
