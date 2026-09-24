// @ts-check

// ============================================
// ESLint Configuration for svelte-real-router
// Extends root config, which lints `.svelte` and `.svelte.ts` (section 15.2).
// Only the package's own test rules below.
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
      "testing-library/no-node-access": "off",
    },
  },
);
