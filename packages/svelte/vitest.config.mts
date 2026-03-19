import { mergeConfig, defineConfig } from "vitest/config";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import unitConfig from "../../vitest.config.unit.mjs";

export default mergeConfig(
  unitConfig,
  defineConfig({
    plugins: [svelte({ hot: false })],
    resolve: {
      conditions: ["browser"],
    },
    test: {
      environment: "jsdom",
      include: ["./tests/**/*.test.ts"],
      setupFiles: "./tests/setup.ts",
      coverage: {
        include: ["packages/svelte/src/**/*.{ts,svelte,svelte.ts}"],
        thresholds: {
          statements: 100,
          branches: 100,
          functions: 95,
          lines: 100,
        },
      },
    },
  }),
);
