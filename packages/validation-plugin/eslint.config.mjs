// @ts-check

import eslintConfig from "../../eslint.config.mjs";

export default [
  ...eslintConfig,
  // `asserts value is NonNullable<unknown>` narrows to "any non-nullish value",
  // which is exactly `{}`: the resolution the rule reports is the intent.
  {
    files: ["src/validators/dependencies.ts"],
    rules: {
      "@typescript-eslint/no-generated-empty-object-type": "off",
    },
  },
];
