// @ts-check

// ============================================
// ESLint Configuration for vue-real-router
// Extends root config. Only Vue-specific rules below.
// All files are .ts (no .vue SFC) — eslint-plugin-vue not needed.
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
    files: ["**/*.test.ts"],
    ...testingLibraryPlugin.configs["flat/dom"],
    rules: {
      ...testingLibraryPlugin.configs["flat/dom"].rules,
      "testing-library/no-node-access": "warn",
    },
  },
);
