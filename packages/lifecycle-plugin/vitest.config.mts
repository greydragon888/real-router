import { mergeConfig, defineConfig } from "vitest/config";
import unitConfig from "../../vitest.config.unit.mjs";

export default mergeConfig(
  unitConfig,
  defineConfig({
    test: {
      environment: "node",
      coverage: {
        include: ["src/**/*.ts"],
      },
    },
  }),
);
