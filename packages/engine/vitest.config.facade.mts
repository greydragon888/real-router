import { mergeConfig, defineConfig } from "vitest/config";
import { commonConfig } from "../../vitest.config.common.mjs";
import unitConfig from "../../vitest.config.unit.mjs";

/**
 * Reachability-ratchet facade run (engine-merge RFC §5.5 / Appendix A).
 *
 * Measures which `src/**` lines are NOT reachable from the FACADE tier alone
 * (tests/functional/** — the engine public API). The layer tiers
 * (tests/unit/{path-matcher,search-params}) are deliberately EXCLUDED here: any
 * src line covered only by them shows up as facade-unreachable, and
 * `scripts/reachability-check.mjs` diffs that set against ENGINE_REACHABILITY.json.
 *
 * Extends `commonConfig` (aliases, base excludes), NOT vitest.config.unit — a
 * mergeConfig would CONCATENATE the inherited functional+unit include with the
 * facade-only one, dragging the layer tiers back in. The coverage file-scope
 * (include/exclude) is reused from the unit config so it can't drift; the 100%
 * thresholds are dropped (this is a measurement, not a gate).
 */
const { thresholds: _gate100, ...coverageScope } = /** @type {any} */ (
  unitConfig
).test.coverage;

export default mergeConfig(
  commonConfig,
  defineConfig({
    test: {
      environment: "node",
      include: ["./tests/functional/**/*.test.ts"],
      coverage: {
        ...coverageScope,
        enabled: true,
        reporter: ["json"],
        reportsDirectory: "./coverage-facade",
      },
    },
  }),
);
