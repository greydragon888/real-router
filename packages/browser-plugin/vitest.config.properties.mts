import { mergeConfig, defineProject } from "vitest/config";
import propertiesConfig from "../../vitest.config.properties.mjs";

/**
 * Vitest configuration for property-based testing (browser-plugin package)
 *
 * Extends root properties config with package-specific settings.
 * Requires jsdom for isBrowserEnvironment() (window + history) — safeParseUrl
 * itself is now environment-agnostic (manual parser, no `new URL()`).
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
