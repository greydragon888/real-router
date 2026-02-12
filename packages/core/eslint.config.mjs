// @ts-check

import eslintConfig from "../../eslint.config.mjs";

export default [
  ...eslintConfig,
  {
    files: ["src/**/*.ts"],
    rules: {
      // Disable cognitive complexity warnings for transition pipeline
      // These functions are complex by nature (async state machines)
      "sonarjs/cognitive-complexity": "off",
    },
  },
  {
    files: ["tests/**/*.ts"],
    rules: {
      // Disable problematic rules for test files during Promise API migration
      // TODO: Re-enable and fix after RFC-8 implementation is complete
      "sonarjs/void-use": "off",
      "sonarjs/assertions-in-tests": "off",
      "vitest/expect-expect": "off",
      "vitest/prefer-strict-equal": "off",
      "vitest/no-conditional-expect": "off",
      "vitest/no-identical-title": "off",
      "@typescript-eslint/no-unnecessary-condition": "off",
      "@typescript-eslint/no-floating-promises": "off",
      "@typescript-eslint/use-unknown-in-catch-callback-variable": "off",
      "@typescript-eslint/no-implied-eval": "off",
      "@typescript-eslint/no-unused-expressions": "off",
      "promise/always-return": "off",
      "promise/no-callback-in-promise": "off",
      "promise/param-names": "off",
    },
  },
];
