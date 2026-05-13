import { mergeConfig, defineProject } from "vitest/config";
import solidPlugin from "vite-plugin-solid";
import propertiesConfig from "../../vitest.config.properties.mjs";

export default mergeConfig(
  propertiesConfig,
  defineProject({
    // Solid-specific signal/store bridges depend on the DOM build of solid-js
    // (server.js stubs `reconcile` so identity-preservation invariants fail
    // under the SSR runtime). Mirror the functional config: solidPlugin +
    // browser conditions for true reactive-graph semantics.
    plugins: [solidPlugin()],
    resolve: {
      conditions: ["development", "browser"],
    },
    test: {
      environment: "node",
      include: ["./tests/property/**/*.properties.ts"],
    },
  }),
);
