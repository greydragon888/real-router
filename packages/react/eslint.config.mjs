// @ts-check

// ============================================
// ESLint 9.39+ Configuration for react-real-router
// Extends root config which includes:
// - globalIgnores helper (ESLint 9.30+)
// - linterOptions with reportUnusedDisableDirectives
// ============================================

import eslintConfig from "../../eslint.config.mjs";
import tsEslint from "typescript-eslint";
import reactPlugin from "eslint-plugin-react";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import testingLibraryPlugin from "eslint-plugin-testing-library";
import unicorn from "eslint-plugin-unicorn";
import promisePlugin from "eslint-plugin-promise";
import eslintPluginPrettierRecommended from "eslint-plugin-prettier/recommended";
import sonarjsPlugin from "eslint-plugin-sonarjs";
import vitestPlugin from "@vitest/eslint-plugin";
import noOnlyTests from "eslint-plugin-no-only-tests";
import jsdoc from "eslint-plugin-jsdoc";

export default tsEslint.config(
  ...eslintConfig,

  // ============================================
  // TYPESCRIPT CONFIGURATION FOR .tsx FILES
  // ============================================
  tsEslint.configs.strictTypeChecked,
  tsEslint.configs.stylisticTypeChecked,
  {
    files: ["**/*.tsx"],
    rules: {
      "prefer-template": "error",
      "no-shadow": "off",
      "@typescript-eslint/no-dynamic-delete": "off",
      "@typescript-eslint/no-shadow": "error",
      "@typescript-eslint/method-signature-style": "error",
      "@typescript-eslint/unified-signatures": "off",

      "@typescript-eslint/consistent-type-imports": [
        "error",
        {
          prefer: "type-imports",
          fixStyle: "separate-type-imports",
          disallowTypeAnnotations: false,
        },
      ],
      "@typescript-eslint/no-import-type-side-effects": "error",

      "@typescript-eslint/explicit-function-return-type": [
        "off",
        {
          allowExpressions: true,
          allowTypedFunctionExpressions: true,
          allowHigherOrderFunctions: true,
          allowDirectConstAssertionInArrowFunctions: true,
        },
      ],
      "@typescript-eslint/explicit-module-boundary-types": [
        "warn",
        {
          allowArgumentsExplicitlyTypedAsAny: true,
        },
      ],
      "@typescript-eslint/no-empty-function": [
        "warn",
        {
          allow: ["arrowFunctions"],
        },
      ],
      "@typescript-eslint/naming-convention": [
        "warn",
        {
          selector: "interface",
          format: ["PascalCase"],
          custom: {
            regex: "^I[A-Z]",
            match: false,
          },
        },
        {
          selector: "typeAlias",
          format: ["PascalCase"],
        },
        {
          selector: "enum",
          format: ["PascalCase"],
        },
      ],
      "@typescript-eslint/member-ordering": [
        "warn",
        {
          default: [
            "signature",
            "call-signature",
            "public-static-field",
            "static-field",
            "public-decorated-field",
            "decorated-field",
            "public-instance-field",
            "public-field",
            "instance-field",
            "field",
            "public-abstract-field",
            "abstract-field",
            "public-static-get",
            "static-get",
            "public-get",
            "public-decorated-get",
            "public-instance-get",
            "public-abstract-get",
            "decorated-get",
            "instance-get",
            "get",
            "abstract-get",
            "public-static-set",
            "public-decorated-set",
            "decorated-set",
            "static-set",
            "public-instance-set",
            "public-set",
            "instance-set",
            "set",
            "public-abstract-set",
            "abstract-set",
            "protected-static-field",
            "protected-decorated-field",
            "protected-instance-field",
            "protected-field",
            "protected-abstract-field",
            "protected-static-get",
            "protected-decorated-get",
            "protected-get",
            "protected-abstract-get",
            "protected-static-set",
            "protected-decorated-set",
            "protected-instance-set",
            "protected-set",
            "protected-abstract-set",
            "private-static-field",
            "#private-static-field",
            "private-decorated-field",
            "private-instance-field",
            "#private-instance-field",
            "private-field",
            "#private-field",
            "private-static-get",
            "#private-static-get",
            "protected-instance-get",
            "private-decorated-get",
            "private-instance-get",
            "#private-instance-get",
            "private-get",
            "#private-get",
            "private-static-set",
            "#private-static-set",
            "private-decorated-set",
            "private-instance-set",
            "#private-instance-set",
            "private-set",
            "#private-set",
            "static-initialization",
            "public-constructor",
            "protected-constructor",
            "private-constructor",
            "constructor",
            "public-static-method",
            "static-method",
            "public-decorated-method",
            "decorated-method",
            "public-method",
            "public-instance-method",
            "instance-method",
            "method",
            "public-abstract-method",
            "abstract-method",
            "protected-static-method",
            "protected-decorated-method",
            "protected-instance-method",
            "protected-method",
            "protected-abstract-method",
            "private-static-method",
            "#private-static-method",
            "private-decorated-method",
            "private-instance-method",
            "private-method",
            "#private-instance-method",
            "#private-method",
          ],
        },
      ],
      "@typescript-eslint/restrict-template-expressions": [
        "error",
        {
          allowNumber: true,
        },
      ],
    },
  },

  // ============================================
  // JSDOC CONFIGURATION FOR .tsx FILES
  // ============================================
  {
    files: ["src/**/*.tsx", "!**/*.test.tsx", "!**/*.spec.tsx"],
    plugins: {
      jsdoc,
    },
    settings: {
      jsdoc: {
        mode: "typescript",
        tagNamePreference: {
          returns: "returns",
        },
      },
    },
    rules: {
      "jsdoc/require-description": "off",
      "jsdoc/require-param-description": "warn",
      "jsdoc/require-returns-description": "warn",
      "jsdoc/check-alignment": "warn",
      "jsdoc/check-param-names": "error",
      "jsdoc/check-tag-names": [
        "error",
        {
          definedTags: ["security", "fires", "remarks"],
        },
      ],
      "jsdoc/check-types": "off",
      "jsdoc/require-hyphen-before-param-description": "warn",
      "jsdoc/tag-lines": ["warn", "any", { startLines: 1 }],
      "jsdoc/no-bad-blocks": "error",
      "jsdoc/no-defaults": "warn",
    },
  },

  // ============================================
  // UNICORN CONFIGURATION FOR .tsx FILES
  // ============================================
  // Updated for eslint-plugin-unicorn v62.0.0
  // Changelog: https://github.com/sindresorhus/eslint-plugin-unicorn/releases
  {
    files: ["**/*.tsx"],
    plugins: {
      unicorn,
    },
    rules: {
      ...unicorn.configs.recommended.rules,

      // ============================================
      // NEW RULES (v56-v62)
      // ============================================
      // v62: Disallow mutating variables immediately after declaration
      "unicorn/no-immediate-mutation": "error",
      // v62: Disallow unnecessary arguments for collection methods
      "unicorn/no-useless-collection-argument": "error",
      // v61: Prefer class field declarations over constructor assignments
      "unicorn/prefer-class-fields": "error",
      // v60: Enforce consistent use of assert styles (node:assert)
      "unicorn/consistent-assert": "error",
      // v60: Disallow instanceof on built-in constructors (use typeof, Array.isArray)
      "unicorn/no-instanceof-builtins": "error",
      // v59: Disallow recursive getters/setters (infinite loop prevention)
      "unicorn/no-accessor-recursion": "error",
      // v59: Prefer globalThis over global/window/self
      "unicorn/prefer-global-this": "error",
      // v58: Disallow unnecessary await expressions
      "unicorn/no-unnecessary-await": "error",
      // v58: Prefer structuredClone over JSON.parse(JSON.stringify())
      "unicorn/prefer-structured-clone": "error",
      // v57: Enforce consistent empty array spread
      "unicorn/consistent-empty-array-spread": "error",
      // v56: Prefer String.raw for template literals with escapes
      "unicorn/prefer-string-raw": "warn",

      // ============================================
      // DISABLED RULES (too strict or unsuitable)
      // ============================================
      "unicorn/prevent-abbreviations": "off",
      "unicorn/no-null": "off",
      "unicorn/prefer-top-level-await": "off",
      "unicorn/no-array-reduce": "warn",
      "unicorn/prefer-module": "off",
      "unicorn/prefer-node-protocol": "off",
      "unicorn/filename-case": "off",
      "unicorn/no-array-for-each": "off",
      "unicorn/prefer-spread": "warn",
      "unicorn/prefer-ternary": "warn",
      "unicorn/no-useless-undefined": [
        "warn",
        { checkArguments: false, checkArrowFunctionBody: false },
      ],
      "unicorn/no-typeof-undefined": "off",
      "unicorn/expiring-todo-comments": "off",
    },
  },

  // ============================================
  // PROMISE CONFIGURATION FOR .tsx FILES
  // ============================================
  {
    files: ["**/*.tsx"],
    plugins: {
      promise: promisePlugin,
    },
    rules: {
      ...promisePlugin.configs.recommended.rules,
      "promise/prefer-await-to-then": "off",
      "promise/prefer-await-to-callbacks": "off",
      "promise/always-return": "error",
      "promise/catch-or-return": "error",
      "promise/no-return-wrap": "error",
      "promise/no-nesting": "warn",
    },
  },

  // ============================================
  // NO-ONLY-TESTS FOR .tsx TEST FILES
  // ============================================
  {
    files: ["tests/**/*.tsx", "benchmarks/**/*.tsx"],
    plugins: {
      "no-only-tests": noOnlyTests,
    },
    rules: {
      "no-only-tests/no-only-tests": "error",
    },
  },

  // ============================================
  // PRETTIER CONFIGURATION FOR .tsx FILES
  // ============================================
  {
    files: ["**/*.tsx"],
    plugins: {
      prettier: eslintPluginPrettierRecommended.plugins?.prettier,
    },
    rules: {
      ...eslintPluginPrettierRecommended.rules,
      curly: "error",
      "prefer-arrow-callback": "error",
    },
  },

  // ============================================
  // SONARJS CONFIGURATION FOR .tsx FILES
  // ============================================
  {
    files: ["**/*.tsx"],
    plugins: {
      sonarjs: sonarjsPlugin,
    },
    rules: {
      ...sonarjsPlugin.configs.recommended.rules,
      "sonarjs/no-nested-functions": "off",
      "sonarjs/todo-tag": "off",
      "sonarjs/different-types-comparison": "off",
      "sonarjs/cognitive-complexity": ["warn", 15],
      "sonarjs/no-duplicate-string": ["warn", { threshold: 5 }],
    },
  },

  // ============================================
  // REACT CONFIGURATION
  // ============================================
  {
    settings: {
      react: {
        version: "18.0",
      },
    },
  },
  reactPlugin.configs.flat.recommended,
  reactPlugin.configs.flat["jsx-runtime"],
  {
    files: ["**/*.tsx"],
    rules: {
      "react/react-in-jsx-scope": "off",
      "react/jsx-uses-react": "off",
      "react/prop-types": "off",
      "react/display-name": "off",
    },
  },
  // ============================================
  // REACT HOOKS CONFIGURATION (v7+ flat config API)
  // ============================================
  // Using manual configuration instead of presets because:
  // - v7 presets include experimental React Compiler rules
  // - These rules are too strict for valid patterns (useSyncExternalStore, ref initialization)
  // - Classic rules (rules-of-hooks, exhaustive-deps) are stable and well-tested
  {
    files: ["**/*.tsx"],
    plugins: {
      "react-hooks": reactHooksPlugin,
    },
    settings: {
      // v6.1.0+: Configure custom effect hooks for exhaustive-deps rule
      // Add custom hooks that behave like useEffect here
      "react-hooks": {
        additionalEffectHooks: [],
      },
    },
    rules: {
      // Classic React Hooks rules (stable)
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",

      // React Compiler rules (experimental) - disabled
      // These rules enforce React Compiler purity requirements but are too strict
      // for common valid patterns like useSyncExternalStore initialization
      // Enable selectively when React Compiler is adopted
      "react-hooks/globals": "off",
      "react-hooks/immutability": "off",
      "react-hooks/refs": "off",
      "react-hooks/purity": "off",
      "react-hooks/set-state-in-render": "off",
      "react-hooks/error-boundaries": "off",
    },
  },

  // ============================================
  // VITEST CONFIGURATION FOR .test.tsx FILES
  // ============================================
  {
    files: ["tests/**/*.test.tsx"],
    plugins: {
      vitest: vitestPlugin,
    },
    languageOptions: {
      globals: vitestPlugin.configs.env.languageOptions.globals,
    },
    rules: {
      ...vitestPlugin.configs.all.rules,
      "vitest/require-to-throw-message": "off",
      "vitest/prefer-lowercase-title": "off",
      "vitest/no-hooks": "off",
      "vitest/prefer-expect-assertions": "off",
      "vitest/max-expects": "off",
      "vitest/require-mock-type-parameters": "off",
      "vitest/prefer-called-with": "off",
      "vitest/prefer-to-be": "off",
      "vitest/prefer-describe-function-title": "off",
      "vitest/padding-around-expect-groups": "warn",
      "vitest/consistent-test-filename": "warn",
      "vitest/prefer-strict-equal": "error",
      "@typescript-eslint/consistent-type-assertions": "off",
      "@typescript-eslint/prefer-promise-reject-errors": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-function-type": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-redundant-type-constituents": "off",
      "@typescript-eslint/no-invalid-void-type": "off",
      "@typescript-eslint/no-shadow": "off",
      "@typescript-eslint/explicit-function-return-type": "off",
      "sonarjs/no-commented-code": "warn",
      "sonarjs/no-duplicate-string": "off",
      "sonarjs/function-return-type": "off",
      "sonarjs/different-types-comparison": "off",
      "sonarjs/no-unused-collection": "off",
      "unicorn/consistent-function-scoping": "off",
      "import-x/no-default-export": "off",
      "import-x/no-unresolved": "off",
      "prefer-const": "off",
      "prefer-rest-params": "off",

      // React Compiler rules (v7+) - disabled for test files
      // Tests legitimately need to capture values and access refs for assertions
      "react-hooks/globals": "off",
      "react-hooks/immutability": "off",
      "react-hooks/refs": "off",
    },
  },

  // ============================================
  // TESTING LIBRARY CONFIGURATION
  // ============================================
  // Updated for eslint-plugin-testing-library v7.15.4
  // Changelog: https://github.com/testing-library/eslint-plugin-testing-library/releases
  // Key changes since v7.2:
  // - CJS and ESM bundle formats (v7.15.0)
  // - prefer-user-event-setup rule (v7.14.0)
  // - Static configuration generation for better performance (v7.13.6)
  {
    files: ["**/*.test.tsx"],
    ...testingLibraryPlugin.configs["flat/react"],
    rules: {
      ...testingLibraryPlugin.configs["flat/react"].rules,
      // v7.14.0: Encourage using userEvent.setup() for better testing practices
      // userEvent.setup() creates a user session with proper event sequencing
      "testing-library/prefer-user-event-setup": "warn",
      // Direct DOM node access (e.g., element.click()) - warn instead of error
      // Prefer userEvent.click(element) or fireEvent.click(element)
      "testing-library/no-node-access": "warn",
    },
  },

  // ============================================
  // BENCHMARK FILES FOR .tsx
  // ============================================
  {
    files: ["benchmarks/**/*.tsx"],
    plugins: {
      vitest: vitestPlugin,
    },
    rules: {
      ...vitestPlugin.configs.all.rules,
      "vitest/require-to-throw-message": "off",
      "vitest/prefer-lowercase-title": "off",
      "vitest/no-hooks": "off",
      "vitest/prefer-expect-assertions": "off",
      "vitest/max-expects": "off",
      "@typescript-eslint/explicit-function-return-type": "off",
      "import-x/no-default-export": "off",
      "@typescript-eslint/no-unused-expressions": "off",
      "import-x/no-unresolved": "off",

      // React Compiler rules (v7+) - disabled for benchmark files
      "react-hooks/globals": "off",
      "react-hooks/immutability": "off",
      "react-hooks/refs": "off",
    },
  },
);
