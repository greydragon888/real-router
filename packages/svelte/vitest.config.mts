import { mergeConfig, defineConfig } from "vitest/config";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import unitConfig from "../../vitest.config.unit.mjs";

export default mergeConfig(
  unitConfig,
  defineConfig({
    plugins: [svelte()],
    resolve: {
      conditions: ["browser"],
    },
    test: {
      environment: "jsdom",
      include: ["./tests/**/*.test.ts"],
      setupFiles: "./tests/setup.ts",
      coverage: {
        include: ["src/**/*.{ts,svelte,svelte.ts}"],
        // One branch no test reaches: the `?? ''` the compiler writes around the
        // text interpolation `{state.error.message}` in Lazy.svelte, which only an
        // Error without a message would take. The other metrics take the global
        // 100.
        thresholds: {
          branches: 99,
        },
      },
    },
  }),
);
