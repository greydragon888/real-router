import { mergeConfig, defineProject } from "vitest/config";
import unitConfig from "../../vitest.config.unit.mjs";

/**
 * Vitest configuration for logger package
 * Extends root unit config with Node.js environment and local test paths
 */
export default mergeConfig(
  unitConfig,
  defineProject({
    test: {
      environment: "node",
    },
  }),
);
