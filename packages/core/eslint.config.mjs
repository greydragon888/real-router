// @ts-check

import eslintConfig from "../../eslint.config.mjs";

export default [
  // Old functional modules (dead code, not used by new namespace-based Router)
  {
    ignores: [
      "src/core/routes/",
      "src/core/state.ts",
      "src/core/dependencies.ts",
      "src/core/middleware.ts",
      "src/core/navigation.ts",
      "src/core/observable.ts",
      "src/core/options.ts",
      "src/core/plugins.ts",
      "src/core/routeLifecycle.ts",
      "src/core/routerLifecycle.ts",
    ],
  },
  ...eslintConfig,
];
