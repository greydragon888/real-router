// @ts-check

// ============================================
// ESLint Configuration for react-real-router
// Extends root config. Only React-specific rules below.
// ============================================

import eslintConfig from "../../eslint.config.mjs";
import tsEslint from "typescript-eslint";
import eslintReact from "@eslint-react/eslint-plugin";
import testingLibraryPlugin from "eslint-plugin-testing-library";

export default tsEslint.config(
  ...eslintConfig,

  // ============================================
  // @eslint-react v3 — recommended-type-checked
  // Includes rules-of-hooks + exhaustive-deps (ported from react-hooks)
  // ============================================
  {
    ...eslintReact.configs["recommended-type-checked"],
    files: ["**/*.tsx"],
    rules: {
      ...eslintReact.configs["recommended-type-checked"].rules,
      "@eslint-react/no-use-context": "off",
      "@eslint-react/no-context-provider": "off",
    },
  },

  // ============================================
  // TEST OVERRIDES — tests use intentional anti-patterns
  // ============================================
  {
    files: ["tests/**/*.tsx"],
    rules: {
      "@eslint-react/component-hook-factories": "off",
      "@eslint-react/exhaustive-deps": "off",
      "@eslint-react/use-state": "off",
    },
  },

  // ============================================
  // TESTING LIBRARY — React variant
  // ============================================
  {
    files: ["**/*.test.tsx", "**/*.stress.tsx"],
    ...testingLibraryPlugin.configs["flat/react"],
    rules: {
      ...testingLibraryPlugin.configs["flat/react"].rules,
      "testing-library/prefer-user-event-setup": "warn",
      "testing-library/no-node-access": "warn",
    },
  },

  // ============================================
  // STRESS TEST OVERRIDES
  // ============================================
  {
    files: ["tests/**/*.stress.tsx"],
    rules: {
      "import-x/no-extraneous-dependencies": "off",
      "testing-library/no-manual-cleanup": "off",
      "testing-library/render-result-naming-convention": "off",
      "testing-library/prefer-screen-queries": "off",
      "testing-library/no-container": "off",
      "testing-library/no-node-access": "off",
      "testing-library/no-unnecessary-act": "off",
      "@eslint-react/no-nested-component-definitions": "off",
      "@eslint-react/no-array-index-key": "off",
    },
  },

  // ============================================
  // A11Y TEST OVERRIDES
  // ============================================
  {
    files: ["tests/**/*.a11y.test.tsx"],
    rules: { "testing-library/no-node-access": "off" },
  },
);
