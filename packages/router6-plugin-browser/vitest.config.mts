import { mergeConfig, defineProject } from "vitest/config";
import unitConfig from "../../vitest.config.unit.mjs";

/**
 * Vitest configuration for router6-plugin-browser package
 * Extends root unit config with jsdom environment for browser API testing
 */
export default mergeConfig(
  unitConfig,
  defineProject({
    test: {
      environment: "jsdom",
      setupFiles: "./tests/setup.ts",
    },
  }),
);
