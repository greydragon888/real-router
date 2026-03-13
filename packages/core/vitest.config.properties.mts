import { mergeConfig, defineProject } from "vitest/config";
import propertiesConfig from "../../vitest.config.properties.mjs";

/**
 * Vitest configuration for property-based testing (core package)
 *
 * Extends root properties config with package-specific settings
 */
export default mergeConfig(
  propertiesConfig,
  defineProject({
    test: {
      environment: "node",
      include: ["./tests/property/**/*.properties.ts"],
      setupFiles: ["./tests/setup.ts"],
    },
  }),
);
