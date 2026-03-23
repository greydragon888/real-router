// @ts-check

// ============================================
// ESLint 9.39+ Configuration for preact-real-router
// Based on react-real-router config with Preact-specific adaptations:
// - No @eslint-react (React-specific JSX/component analysis)
// - testing-library/flat/dom instead of flat/react
// ============================================

import eslintConfig from "../../eslint.config.mjs";
import tsEslint from "typescript-eslint";
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
  {
    files: ["**/*.tsx"],
    plugins: {
      unicorn,
    },
    rules: {
      ...unicorn.configs.recommended.rules,

      "unicorn/no-immediate-mutation": "error",
      "unicorn/no-useless-collection-argument": "error",
      "unicorn/prefer-class-fields": "error",
      "unicorn/consistent-assert": "error",
      "unicorn/no-instanceof-builtins": "error",
      "unicorn/no-accessor-recursion": "error",
      "unicorn/prefer-global-this": "error",
      "unicorn/no-unnecessary-await": "error",
      "unicorn/prefer-structured-clone": "error",
      "unicorn/consistent-empty-array-spread": "error",
      "unicorn/prefer-string-raw": "warn",

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
    files: ["tests/**/*.tsx"],
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
  // REACT HOOKS CONFIGURATION
  // ============================================
  // react-hooks plugin works with Preact hooks (same naming convention)
  {
    files: ["**/*.tsx"],
    plugins: {
      "react-hooks": reactHooksPlugin,
    },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",

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
      "@typescript-eslint/unbound-method": "off",
      "prefer-const": "off",
      "prefer-rest-params": "off",

      "react-hooks/globals": "off",
      "react-hooks/immutability": "off",
      "react-hooks/refs": "off",
    },
  },

  // ============================================
  // TESTING LIBRARY CONFIGURATION
  // ============================================
  // Using flat/dom for Preact (no React-specific rules)
  {
    files: ["**/*.test.tsx"],
    ...testingLibraryPlugin.configs["flat/dom"],
    rules: {
      ...testingLibraryPlugin.configs["flat/dom"].rules,
      "testing-library/no-node-access": "warn",
    },
  },

  {
    files: ["tests/**/*.a11y.test.tsx"],
    rules: {
      "testing-library/no-node-access": "off",
    },
  },
);
