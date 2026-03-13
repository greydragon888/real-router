import { mergeConfig, defineProject } from "vitest/config";
import propertiesConfig from "../../vitest.config.properties.mjs";

/**
 * Vitest configuration for property-based testing (browser-plugin package)
 *
 * Extends root properties config with package-specific settings.
 * Requires jsdom environment for:
 * - isBrowserEnvironment() check (window + history)
 * - safeParseUrl() uses new URL(url, globalThis.location.origin)
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
