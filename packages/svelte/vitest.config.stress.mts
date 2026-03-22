import { mergeConfig, defineConfig } from "vitest/config";
import { commonConfig } from "../../vitest.config.common.mjs";
import { svelte } from "@sveltejs/vite-plugin-svelte";

export default mergeConfig(
  commonConfig,
  defineConfig({
    plugins: [svelte({ hot: false })],
    resolve: {
      conditions: ["browser"],
    },
    test: {
      environment: "jsdom",
      include: ["./tests/stress/**/*.stress.ts"],
      setupFiles: "./tests/setup.ts",
      coverage: { enabled: false },
      pool: "forks",
      maxWorkers: 2,
      testTimeout: 60000,
      hookTimeout: 15000,
    },
  }),
);
