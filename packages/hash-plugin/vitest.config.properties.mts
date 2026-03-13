import { mergeConfig, defineProject } from "vitest/config";
import propertiesConfig from "../../vitest.config.properties.mjs";

/**
 * Vitest configuration for property-based testing (hash-plugin package)
 *
 * Extends root properties config with package-specific settings.
 * Requires jsdom environment for browser API simulation (location, history).
 */
export default mergeConfig(
  propertiesConfig,
  defineProject({
    test: {
      environment: "jsdom",
      include: ["./tests/property/**/*.properties.ts"],
    },
  }),
);
