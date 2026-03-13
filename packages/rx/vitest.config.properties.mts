import { mergeConfig, defineProject } from "vitest/config";
import propertiesConfig from "../../vitest.config.properties.mjs";

/**
 * Vitest configuration for property-based testing (rx package)
 *
 * Extends root properties config with package-specific settings.
 * Timing-dependent operators (debounceTime) are excluded from PBT.
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
