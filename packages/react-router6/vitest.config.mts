import { mergeConfig, defineProject } from "vitest/config";
import unitConfig from "../../vitest.config.unit.mjs";

/**
 * Vitest configuration for react-router6 package
 * Extends root unit config with jsdom environment for React testing
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
