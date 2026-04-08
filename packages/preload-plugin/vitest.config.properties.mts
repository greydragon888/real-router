import { mergeConfig, defineProject } from "vitest/config";
import propertiesConfig from "../../vitest.config.properties.mts";

/**
 * Vitest configuration for property-based testing (preload-plugin package)
 *
 * Extends root properties config with package-specific settings.
 * Requires jsdom environment for:
 * - navigator.connection access (isSlowConnection)
 * - document event listeners (PreloadPlugin)
 */
export default mergeConfig(
  propertiesConfig,
  defineProject({
    test: {
      environment: "jsdom",
      include: ["./tests/property/**/*.properties.ts"],
      setupFiles: "./tests/setup.ts",
    },
  }),
);
