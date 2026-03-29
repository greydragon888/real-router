import { svelteTesting } from "@testing-library/svelte/vite";
import { defineConfig, mergeConfig } from "vitest/config";

import viteConfig from "./vite.config";

export default mergeConfig(
  viteConfig,
  defineConfig({
    plugins: [svelteTesting()],
    test: {
      environment: "jsdom",
      include: ["./tests/**/*.test.ts?(x)"],
      setupFiles: "./tests/setup.ts",
      globals: true,
      restoreMocks: true,
    },
  }),
);
