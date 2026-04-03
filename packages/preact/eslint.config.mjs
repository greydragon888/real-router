// @ts-check

// ============================================
// ESLint Configuration for preact-real-router
// Extends root config. Only Preact-specific rules below.
// ============================================

import eslintConfig from "../../eslint.config.mjs";
import tsEslint from "typescript-eslint";
import eslintReact from "@eslint-react/eslint-plugin";
import reactJsx from "eslint-plugin-react-jsx";
import testingLibraryPlugin from "eslint-plugin-testing-library";

export default tsEslint.config(
  ...eslintConfig,

  // ============================================
  // @eslint-react v4 — with Preact import source
  // rules-of-hooks and exhaustive-deps work with Preact hooks
  // ============================================
  {
    ...eslintReact.configs["recommended-type-checked"],
    files: ["**/*.tsx"],
    settings: {
      "react-x": {
        importSource: "preact",
        jsxPragma: "h",
        jsxPragmaFrag: "Fragment",
      },
    },
    rules: {
      ...eslintReact.configs["recommended-type-checked"].rules,
      "@eslint-react/no-use-context": "off",
      "@eslint-react/no-context-provider": "off",
      // Experimental rules (useful for library code)
      "@eslint-react/immutability": "warn",
      "@eslint-react/refs": "warn",
    },
  },

  // ============================================
  // eslint-plugin-react-jsx — JSX-specific rules
  // ============================================
  {
    ...reactJsx.configs.recommended,
    files: ["**/*.tsx"],
  },

  // ============================================
  // TEST OVERRIDES — stress tests use intentional anti-patterns
  // ============================================
  {
    files: ["tests/**/*.tsx"],
    rules: {
      "@eslint-react/component-hook-factories": "off",
      "@eslint-react/no-nested-component-definitions": "off",
      "@eslint-react/no-array-index-key": "off",
      "@eslint-react/exhaustive-deps": "off",
      "@eslint-react/use-state": "off",
      "@eslint-react/immutability": "off",
      "@eslint-react/refs": "off",
    },
  },

  // ============================================
  // TESTING LIBRARY — DOM variant (not React!)
  // ============================================
  {
    files: ["**/*.test.tsx"],
    ...testingLibraryPlugin.configs["flat/dom"],
    rules: {
      ...testingLibraryPlugin.configs["flat/dom"].rules,
      "testing-library/no-node-access": "warn",
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
