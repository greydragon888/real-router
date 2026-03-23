import { mergeConfig, defineProject } from "vitest/config";
import unitConfig from "../../vitest.config.unit.mjs";

/**
 * Vitest configuration for preact-real-router package
 * Extends root unit config with jsdom environment for Preact testing
 */
export default mergeConfig(
  unitConfig,
  defineProject({
    test: {
      environment: "jsdom",
      include: ["./tests/**/*.test.ts?(x)"],
      setupFiles: "./tests/setup.ts",
    },
  }),
);
