// @ts-check

import eslintConfig from "../../eslint.config.mjs";

export default [
  ...eslintConfig,
  {
    files: ["tests/**/*.ts"],
    rules: {
      // Conflicts with @typescript-eslint/no-floating-promises which requires `void` prefix
      "sonarjs/void-use": "off",
      // Tests use defensive optional chaining / explicit checks even when types guarantee the value
      "@typescript-eslint/no-unnecessary-condition": "off",
      // Tests extensively use expect() inside try/catch blocks
      "vitest/no-conditional-expect": "off",
    },
  },
];
