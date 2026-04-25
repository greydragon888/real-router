import { mergeConfig, defineConfig } from "vitest/config";
import solidPlugin from "vite-plugin-solid";
import unitConfig from "../../vitest.config.unit.mjs";

export default mergeConfig(
  unitConfig,
  defineConfig({
    plugins: [solidPlugin()],
    test: {
      environment: "jsdom",
      include: ["./tests/**/*.test.ts?(x)"],
      setupFiles: "./tests/setup.ts",
      coverage: {
        thresholds: {
          branches: 90,
          // Marker-with-getter pattern (Match/Self/NotFound) plus inline
          // JSX expressions that Solid compiles to thunks both count as
          // functions/statements in v8 coverage. Adding Self brought the
          // function count up by ~3 (one marker + 2 JSX thunks for the
          // with/without-fallback branches), tipping thresholds below
          // 100 % even with full behavioral coverage.
          functions: 95,
          statements: 99,
          lines: 99,
        },
      },
    },
    resolve: {
      // "development" needed for solid-js dev mode exports.
      conditions: ["development", "browser"],
    },
  }),
);
