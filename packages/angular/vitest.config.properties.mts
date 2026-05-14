import { mergeConfig, defineProject } from "vitest/config";
import propertiesConfig from "../../vitest.config.properties.mjs";

export default mergeConfig(
  propertiesConfig,
  defineProject({
    test: {
      environment: "node",
      include: ["./tests/property/**/*.properties.ts"],
    },
  }),
);
