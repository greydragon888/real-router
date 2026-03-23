import { mergeConfig, defineProject } from "vitest/config";
import propertiesConfig from "../../vitest.config.properties.mjs";

/**
 * Vitest configuration for property-based testing (dom-utils package)
 *
 * Extends root properties config with package-specific settings.
 * Requires jsdom environment for browser API simulation.
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
