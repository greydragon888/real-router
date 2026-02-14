// @ts-check

import eslintConfig from "../../eslint.config.mjs";

export default [
  ...eslintConfig,
  {
    files: ["tests/**/*.ts"],
    rules: {
      // Conflicts with @typescript-eslint/no-floating-promises which requires `void` prefix
      "sonarjs/void-use": "off",
      // Tests use defensive optional chaining even when types guarantee non-null
      "@typescript-eslint/no-unnecessary-condition": "off",
      // Tests extensively use expect() inside try/catch blocks (468 occurrences)
      "vitest/no-conditional-expect": "off",
    },
  },
];
