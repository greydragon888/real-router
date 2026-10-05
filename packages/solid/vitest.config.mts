import { mergeConfig, defineConfig } from "vitest/config";
import solidPlugin from "vite-plugin-solid";
import unitConfig from "../../vitest.config.unit.mjs";

export default mergeConfig(
  unitConfig,
  defineConfig({
    // Hot reload off: by default the plugin appends solid-refresh's
    // `if (import.meta.hot)` block to every module — dev-server code the
    // package does not ship — and coverage counts its untaken side.
    plugins: [solidPlugin({ hot: false })],
    test: {
      environment: "jsdom",
      include: ["./tests/**/*.test.ts?(x)"],
      setupFiles: "./tests/setup.ts",
    },
    resolve: {
      // "development" needed for solid-js dev mode exports.
      conditions: ["development", "browser"],
    },
  }),
);
