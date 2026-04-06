// @ts-check

// ============================================
// ESLint Configuration for router-benchmarks
// Extends root config with benchmark-specific overrides
// ============================================

import eslintConfig from "../../eslint.config.mjs";
import tsEslint from "typescript-eslint";

export default tsEslint.config(
  ...eslintConfig,

  {
    files: ["*.mjs", "*.js"],
    extends: [tsEslint.configs.disableTypeChecked],
  },

  {
    files: ["client-nav/**/*.config.ts", "client-nav/**/vitest.setup.ts"],
    extends: [tsEslint.configs.disableTypeChecked],
  },

  {
    files: ["client-nav/**/*.ts", "client-nav/**/*.tsx"],
    rules: {
      "unicorn/consistent-function-scoping": "off",
      "unicorn/prefer-math-trunc": "off",
      "sonarjs/void-use": "off",
      "sonarjs/no-dead-store": "off",
      "sonarjs/no-duplicate-string": "off",
      "sonarjs/no-unused-vars": "off",
      "sonarjs/function-return-type": "off",
      "sonarjs/prefer-read-only-props": "off",
      "@typescript-eslint/no-confusing-void-expression": "off",
      "@typescript-eslint/no-floating-promises": "off",
      "@typescript-eslint/no-misused-promises": "off",
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-base-to-string": "off",
      "@typescript-eslint/no-shadow": "off",
      "@typescript-eslint/restrict-template-expressions": "off",
      "@typescript-eslint/prefer-promise-reject-errors": "off",
      "@typescript-eslint/no-unnecessary-condition": "off",
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/explicit-module-boundary-types": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/restrict-plus-operands": "off",
      "import-x/no-default-export": "off",
      "id-length": "off",
    },
  },

  {
    files: ["src/**/*.ts"],
    rules: {
      // --- Dynamic require() in router-adapter.ts ---
      "@typescript-eslint/no-require-imports": "off",
      "import-x/no-commonjs": "off",

      // --- any types for dynamically loaded router modules ---
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-return": "off",

      // --- Benchmark-specific patterns ---
      // Inline functions in bench blocks
      "unicorn/consistent-function-scoping": "off",
      // void router.navigate(...) fire-and-forget
      "sonarjs/void-use": "off",
      "@typescript-eslint/no-confusing-void-expression": "off",
      // Floating promises from router.navigate() / router.start()
      "@typescript-eslint/no-floating-promises": "off",
      "@typescript-eslint/no-misused-promises": "off",
      "@typescript-eslint/require-await": "off",
      // Benchmark test data and side-effect assignments
      "sonarjs/no-unused-collection": "off",
      "sonarjs/no-dead-store": "off",
      "sonarjs/pseudo-random": "off",
      // Duplicate strings in benchmark names/descriptions
      "sonarjs/no-duplicate-string": "off",
      // Unused vars from test setup
      "@typescript-eslint/no-unused-vars": "off",
      "sonarjs/no-unused-vars": "off",
      // Return types not needed in benchmark helpers
      "@typescript-eslint/explicit-function-return-type": "off",
      "sonarjs/function-return-type": "off",
      // Empty function for mitata measure() API setup fixture
      "@typescript-eslint/no-empty-function": "off",
      "id-length": "off",
    },
  },
);
