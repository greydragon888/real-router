import { mergeConfig, defineProject } from "vitest/config";
import propertiesConfig from "../../vitest.config.properties.mjs";

export default mergeConfig(
  propertiesConfig,
  defineProject({
    test: {
      environment: "node",
      include: ["./tests/property/**/*.properties.ts"],
      // sourceToSignal / scrollRestoration property tests use TestBed +
      // jsdom (per-file `// @vitest-environment jsdom` override).
      // setupTestBed wires the Angular test environment globally.
      setupFiles: "./tests/setup.ts",
    },
  }),
);
