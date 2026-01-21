// @ts-check

// ============================================
// ESLint Configuration for router-benchmarks
// Extends root config with benchmark-specific overrides
// ============================================

import eslintConfig from "../../eslint.config.mjs";
import tsEslint from "typescript-eslint";

export default tsEslint.config(
  ...eslintConfig,

  // ============================================
  // JAVASCRIPT FILES (no TypeScript type checking)
  // ============================================
  {
    files: ["*.mjs", "*.js"],
    extends: [tsEslint.configs.disableTypeChecked],
  },

  // ============================================
  // BENCHMARK FILES CONFIGURATION
  // ============================================
  {
    files: ["src/**/*.bench.ts"],
    rules: {
      // Benchmarks often define functions inline for performance testing
      "unicorn/consistent-function-scoping": "off",

      // Benchmark tests may use variables without explicit void for clarity
      "sonarjs/void-use": "off",

      // Benchmarks test edge cases with unused collections
      "sonarjs/no-unused-collection": "off",

      // Allow dead stores in benchmarks (assignments for side effects)
      "sonarjs/no-dead-store": "off",

      // Allow pseudo-random for performance testing scenarios
      "sonarjs/pseudo-random": "off",

      // Duplicate strings are common in benchmark names/descriptions
      "sonarjs/no-duplicate-string": "off",

      // Promise rules - benchmarks may intentionally not return/catch promises
      "promise/always-return": "off",
      "promise/no-callback-in-promise": "off",
      "promise/catch-or-return": "off",

      // TypeScript - benchmarks may have unsafe operations for testing
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-floating-promises": "off",
      "@typescript-eslint/no-misused-promises": "off",
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/no-confusing-void-expression": "off",

      // Allow unused vars in benchmarks (testing different scenarios)
      "@typescript-eslint/no-unused-vars": "off",
      "sonarjs/no-unused-vars": "off",

      // Explicit function return types not needed in benchmarks
      "@typescript-eslint/explicit-function-return-type": "off",

      // Mixed return types in guards/middleware factories are intentional
      "sonarjs/function-return-type": "off",
    },
  },
);
