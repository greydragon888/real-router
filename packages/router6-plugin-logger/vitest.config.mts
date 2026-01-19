import { mergeConfig, defineConfig } from "vitest/config";
import unitConfig from "../../vitest.config.unit.mjs";

/**
 * Vitest configuration for real-router-plugin-logger package
 * Extends root unit config with Node.js environment
 */
export default mergeConfig(
  unitConfig,
  defineConfig({
    test: {
      environment: "node",
      coverage: {
        include: ["modules/**/*.ts"],
      },
    },
  }),
);
