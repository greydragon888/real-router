import { mergeConfig, defineProject } from "vitest/config";
import propertiesConfig from "../../vitest.config.properties.mts";

/**
 * Vitest configuration for property-based testing (cache-manager package)
 *
 * Extends root properties config with package-specific settings
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
