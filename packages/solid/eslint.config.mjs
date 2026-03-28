// @ts-check

// ============================================
// ESLint Configuration for solid-real-router
// Extends root config. Only Solid-specific rules below.
// eslint-plugin-solid not added — project dormant, not needed for 804 LOC.
// ============================================

import eslintConfig from "../../eslint.config.mjs";
import tsEslint from "typescript-eslint";
import testingLibraryPlugin from "eslint-plugin-testing-library";

export default tsEslint.config(
  ...eslintConfig,

  // ============================================
  // TESTING LIBRARY — DOM variant
  // ============================================
  {
    files: ["**/*.test.tsx"],
    ...testingLibraryPlugin.configs["flat/dom"],
    rules: {
      ...testingLibraryPlugin.configs["flat/dom"].rules,
      "testing-library/no-node-access": "warn",
    },
  },
);
