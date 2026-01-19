import { mergeConfig, defineProject } from "vitest/config";
import unitConfig from "../../vitest.config.unit.mjs";

/**
 * Vitest configuration for type-guards package
 * Extends root unit config with Node.js environment
 */
export default mergeConfig(
  unitConfig,
  defineProject({
    test: {
      environment: "node",
    },
  }),
);
