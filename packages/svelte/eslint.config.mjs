// @ts-check

// ============================================
// ESLint Configuration for svelte-real-router
// Extends root config. Only Svelte-specific rules below.
// ============================================

import eslintConfig from "../../eslint.config.mjs";
import tsEslint from "typescript-eslint";
import sveltePlugin from "eslint-plugin-svelte";
import svelteParser from "svelte-eslint-parser";
import testingLibraryPlugin from "eslint-plugin-testing-library";

export default tsEslint.config(
  ...eslintConfig,

  // ============================================
  // IGNORE .svelte FILES FROM TS STRICT CHECKS
  // (svelte-eslint-parser handles these)
  // ============================================
  {
    ignores: ["**/*.svelte", "**/*.svelte.ts"],
  },

  // ============================================
  // SVELTE PLUGIN CONFIGURATION
  // ============================================
  ...sveltePlugin.configs["flat/recommended"],
  {
    files: ["**/*.svelte"],
    languageOptions: {
      parser: svelteParser,
      parserOptions: {
        parser: tsEslint.parser,
      },
    },
    rules: {
      // Disable rules that conflict with Svelte
      "import-x/no-mutable-exports": "off",
      "import-x/no-default-export": "off",
    },
  },

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
