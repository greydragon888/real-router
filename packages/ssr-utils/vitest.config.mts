import { mergeConfig, defineProject } from "vitest/config";
import unitConfig from "../../vitest.config.unit.mjs";

export default mergeConfig(
  unitConfig,
  defineProject({
    test: {
      environment: "node",
      setupFiles: ["./tests/setup.ts"],
    },
  }),
);
