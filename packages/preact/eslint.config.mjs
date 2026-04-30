// @ts-check

// ============================================
// ESLint Configuration for preact-real-router
// Extends root config. Only Preact-specific rules below.
// ============================================

import eslintConfig from "../../eslint.config.mjs";
import tsEslint from "typescript-eslint";
import eslintReact from "@eslint-react/eslint-plugin";
import testingLibraryPlugin from "eslint-plugin-testing-library";

export default tsEslint.config(
  ...eslintConfig,

  // ============================================
  // @eslint-react v5 — recommended-type-checked (all-in-one)
  // Preact import source. Includes rules-of-hooks, exhaustive-deps,
  // static-components, and web-api-no-leaked-{fetch,event-listener,timeout,interval,resize-observer}.
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
  // TEST OVERRIDES — stress tests use intentional anti-patterns
  // ============================================
  {
    files: ["tests/**/*.tsx"],
    rules: {
      "@eslint-react/no-nested-component-definitions": "off",
      "@eslint-react/no-array-index-key": "off",
      "@eslint-react/static-components": "off",
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
