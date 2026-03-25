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
  // ALL BENCHMARK SOURCE FILES
  // ============================================
  // All files in this package are benchmark infrastructure.
  // The root config's section 14 (`**/router-benchmarks/src/**/*.ts`)
  // does NOT match when running lint from within the package,
  // so the local config must be self-sufficient.
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
      // Promise chains in bench runners
      "promise/always-return": "off",
      "promise/no-callback-in-promise": "off",
      "promise/catch-or-return": "off",
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
