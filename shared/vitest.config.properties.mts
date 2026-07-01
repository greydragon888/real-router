import { mergeConfig, defineProject } from "vitest/config";
import propertiesConfig from "../vitest.config.properties.mjs";

// Property-based tests for the shared node (#1065) — browser-env + dom-utils.
// jsdom for the same reason as the unit config. The base include is packages-
// scoped (packages/<p>/tests/property/…), so REPLACE it with the shared layout.
const config = mergeConfig(
  propertiesConfig,
  defineProject({
    test: {
      environment: "jsdom",
    },
  }),
);

config.test.include = ["tests/**/*.properties.ts?(x)"];

export default config;
