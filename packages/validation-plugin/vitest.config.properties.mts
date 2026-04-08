import { mergeConfig, defineProject } from "vitest/config";
import propertiesConfig from "../../vitest.config.properties.mjs";

/**
 * Vitest configuration for property-based testing (validation-plugin package)
 *
 * Extends root properties config with package-specific settings.
 * Uses Node.js environment (no browser APIs needed).
 */
export default mergeConfig(
  propertiesConfig,
  defineProject({
    test: {
      environment: "node",
      include: ["./tests/property/**/*.properties.ts"],
    },
  }),
);
