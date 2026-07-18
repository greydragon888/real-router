import { mergeConfig, defineConfig } from "vitest/config";
import unitConfig from "../../vitest.config.unit.mjs";

/**
 * Vitest configuration for real-router package
 * Extends root unit config with Node.js environment
 */
export default mergeConfig(
  unitConfig,
  defineConfig({
    test: {
      environment: "node",
      setupFiles: ["./tests/setup.ts"],
      // The engine test block (engine) sits under tests/foundation/,
      // not tests/{functional,unit}/, so the inherited **/tests/{functional,unit}
      // globs don't reach it — add its tiers explicitly. mergeConfig concatenates
      // include arrays, so core's own tiers still run.
      // NOTE: engine's PROPERTY tier is included HERE (in the coverage `test` run),
      // not only in test:properties — engine's grammar/error paths (e.g.
      // path-matcher/registration/errors.ts) are reachable only through the
      // property fuzzers, so src/engine hits 100% only when facade + layer
      // unit + property run together (see ENGINE_REACHABILITY.json). Core's own
      // code still reaches 100% on functional+unit alone; property is additive.
      include: [
        "./tests/engine/functional/**/*.test.ts",
        "./tests/engine/unit/**/*.test.ts",
        "./tests/engine/property/**/*.properties.ts",
      ],
    },
  }),
);
