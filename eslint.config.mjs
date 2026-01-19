// @ts-check

// ============================================
// ESLint 9.39+ Configuration
// Using globalIgnores helper (ESLint 9.30+) with typescript-eslint
// ============================================

import { globalIgnores } from "eslint/config";
import eslint from "@eslint/js";
import stylistic from "@stylistic/eslint-plugin";
import tsEslint from "typescript-eslint";
import eslintPluginPrettierRecommended from "eslint-plugin-prettier/recommended";
import sonarjsPlugin from "eslint-plugin-sonarjs";
import vitestPlugin from "@vitest/eslint-plugin";
import turboConfig from "eslint-config-turbo/flat";
import eslintPluginImport from "eslint-plugin-import";
import jsdoc from "eslint-plugin-jsdoc";
import vitestGlobals from "eslint-plugin-vitest-globals";
import unicorn from "eslint-plugin-unicorn";
import noOnlyTests from "eslint-plugin-no-only-tests";
import promisePlugin from "eslint-plugin-promise";

export default tsEslint.config(
  // ============================================
  // 1. GLOBAL IGNORES (ESLint 9.30+ globalIgnores helper)
  // ============================================
  globalIgnores([
    "**/dist/**",
    "**/build/**",
    "**/coverage/**",
    "**/.turbo/**",
    "**/node_modules/**",
    "**/*.min.js",
    "**/*.d.ts",
    "**/generated/**",
    "**/.DS_Store", // macOS system files
    "**/*.bak*", // Backup files
  ]),

  // ============================================
  // 2. LINTER OPTIONS (ESLint 9+ linterOptions)
  // ============================================
  {
    linterOptions: {
      // Report unused eslint-disable comments (ESLint 9 feature)
      reportUnusedDisableDirectives: "warn",
    },
  },

  // ============================================
  // 3. BASE CONFIGURATION
  // ============================================
  eslint.configs.recommended,
  {
    rules: {
      // ============================================
      // ESLint v9 NEW RULES
      // ============================================
      // v9.0.0: Detects useless assignments (dead code)
      // Finds variables assigned but never used afterward
      "no-useless-assignment": "warn",

      // v9.35.0: Enforces error cause preservation in catch blocks
      // Will be in eslint:recommended in v10.0.0
      // Ensures original error context is not lost during re-throws
      "preserve-caught-error": "error",
    },
  },

  // ============================================
  // 4. STYLISTIC RULES (all files)
  // ============================================
  // Updated for @stylistic/eslint-plugin v5.7.0
  // Changelog: https://github.com/eslint-stylistic/eslint-stylistic/releases
  // New features in v5.7.0:
  // - type-annotation-spacing: new option to ignore arrow function annotations
  // - dot-location: extended TypeScript/JSX node support
  // - object-curly-spacing: bug fix for spaces before comments in multiline objects
  // - Improved compatibility with @typescript-eslint/parser 8.48.0+
  {
    plugins: {
      "@stylistic": stylistic,
    },
    languageOptions: {
      parser: tsEslint.parser,
    },
    rules: {
      "@stylistic/padding-line-between-statements": [
        "warn",
        {
          blankLine: "always",
          prev: "*",
          next: ["interface", "type"],
        },
        {
          blankLine: "any",
          prev: ["interface", "type"],
          next: "*",
        },
        {
          blankLine: "always",
          prev: "*",
          next: "return",
        },
        {
          blankLine: "always",
          prev: ["const", "let"],
          next: "block-like",
        },
        {
          blankLine: "always",
          prev: ["const", "let"],
          next: "*",
        },
        {
          blankLine: "any",
          prev: ["const", "let"],
          next: ["const", "let"],
        },
        {
          blankLine: "always",
          prev: ["if", "for", "while", "switch"],
          next: "*",
        },
        {
          blankLine: "any",
          prev: ["if", "for", "while", "switch"],
          next: ["if", "for", "while", "switch"],
        },
        {
          blankLine: "always",
          prev: "*",
          next: "break",
        },
        {
          blankLine: "never",
          prev: "*",
          next: ["case", "default"],
        },
        {
          blankLine: "always",
          prev: "*",
          next: "throw",
        },
        {
          blankLine: "always",
          prev: "import",
          next: "*",
        },
        {
          blankLine: "any",
          prev: "import",
          next: "import",
        },
        {
          blankLine: "always",
          prev: "*",
          next: "export",
        },
      ],
    },
  },

  // ============================================
  // 5. TYPESCRIPT CONFIGURATION
  // ============================================
  // Updated for typescript-eslint v8.51.0
  // Changelog: https://github.com/typescript-eslint/typescript-eslint/releases
  // Key changes since v8.29:
  // - projectService is now stable and recommended (v8.0+)
  // - no-useless-default-assignment rule (v8.50.0)
  // - Intl.Segmenter replaces graphemer (v8.49.0)
  // - tinyglobby replaces fast-glob (v8.48.0)
  tsEslint.configs.strictTypeChecked,
  tsEslint.configs.stylisticTypeChecked,
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parserOptions: {
        // projectService is stable in v8 (was EXPERIMENTAL_useProjectService)
        // Provides better performance and easier configuration than project: true
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "prefer-template": "error",
      "no-shadow": "off",
      "@typescript-eslint/no-dynamic-delete": "off",
      "@typescript-eslint/no-shadow": "error",
      "@typescript-eslint/method-signature-style": "error",
      "@typescript-eslint/unified-signatures": "off",

      // v8.50.0: Detect useless default assignments (x = undefined)
      "@typescript-eslint/no-useless-default-assignment": "warn",

      // v8.53.0: Strict void return type checking
      // Disabled: 746 existing violations need gradual fixes
      "@typescript-eslint/strict-void-return": "off",

      // v8.53.0: Auto-remove unused imports with --fix
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],

      // ============================================
      // STYLISTIC TYPE-CHECKED RULES (v8.0+)
      // ============================================
      // v8.0+: Prefer .find() over .filter()[0] for better performance
      "@typescript-eslint/prefer-find": "warn",

      // ============================================
      // TYPE IMPORTS CONFIGURATION
      // ============================================
      // Separate type imports from value imports
      "@typescript-eslint/consistent-type-imports": [
        "error",
        {
          prefer: "type-imports",
          fixStyle: "separate-type-imports",
          disallowTypeAnnotations: false,
        },
      ],
      // Enforce no side effects from type imports
      "@typescript-eslint/no-import-type-side-effects": "error",

      "@typescript-eslint/explicit-function-return-type": [
        "off", // Too many warnings for internal functions
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
          allow: [
            "arrowFunctions", // Allow empty arrow functions (for noop and stubs)
          ],
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
            // Index signature
            "signature",
            "call-signature",
            // Fields
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
            // Static initialization
            "static-initialization",
            // Constructors
            "public-constructor",
            "protected-constructor",
            "private-constructor",
            "constructor",
            // Methods
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
  // 6. IMPORT PLUGIN CONFIGURATION
  // ============================================
  // Updated for eslint-plugin-import v2.32.0
  // Changelog: https://github.com/import-js/eslint-plugin-import/releases
  // Key changes since v2.31:
  // - enforce-node-protocol-usage rule (v2.32.0)
  // - TypeScript type definitions
  {
    plugins: {
      import: eslintPluginImport,
    },
    settings: {
      "import/resolver": {
        typescript: {
          alwaysTryTypes: true,
          project: ["./tsconfig.json", "packages/*/tsconfig.json"],
        },
      },
    },
    rules: {
      ...eslintPluginImport.configs.recommended.rules,
      ...eslintPluginImport.configs.typescript.rules,
      "import/order": [
        "error",
        {
          groups: [
            "builtin",
            "external",
            "internal",
            ["parent", "sibling"],
            "index",
            "type",
          ],
          pathGroups: [
            {
              pattern: "@/**",
              group: "internal",
              position: "after",
            },
          ],
          pathGroupsExcludedImportTypes: ["builtin"],
          alphabetize: {
            order: "asc",
            caseInsensitive: true,
          },
          "newlines-between": "always",
        },
      ],
      "import/no-nodejs-modules": "off",
      "import/no-commonjs": "error",
      "import/no-unresolved": "error", // ✅ Enabled thanks to typescript resolver
      // Prevent duplicate imports, prefer separate type imports
      // Works in tandem with @typescript-eslint/consistent-type-imports
      "import/no-duplicates": [
        "error",
        {
          "prefer-inline": false, // Keep type imports separate, not inline
        },
      ],
      "import/no-cycle": ["error", { maxDepth: 3 }],
      "import/no-self-import": "error",
      "import/no-useless-path-segments": "error",
      "import/first": "error",
      "import/newline-after-import": "error",
      "import/no-default-export": "warn",
      // v2.32.0: Enforce node: protocol for Node.js built-ins
      // This improves clarity and is required for some environments
      "import/enforce-node-protocol-usage": ["warn", "always"],
    },
  },

  // ============================================
  // 7. JSDOC CONFIGURATION (for public APIs)
  // ============================================
  // Updated for eslint-plugin-jsdoc v61.5.0
  // Changelog: https://github.com/gajus/eslint-plugin-jsdoc/releases
  // New features in v61.x:
  // - Granular flat configs (contents/logical/stylistic)
  // - check-template-names rule for TypeScript generics
  // - informative-docs rule for meaningful documentation
  // - no-blank-block-descriptions rule
  {
    files: [
      "**/modules/**/*.ts",
      "!**/__tests__/**",
      "!**/*.test.ts",
      "!**/*.spec.ts",
    ],
    plugins: {
      jsdoc,
    },
    settings: {
      jsdoc: {
        mode: "typescript", // Important for TSDoc compatibility
        tagNamePreference: {
          returns: "returns", // TSDoc uses @returns, not @return
        },
      },
    },
    rules: {
      // ============================================
      // DOCUMENTATION REQUIREMENTS
      // ============================================
      "jsdoc/require-description": "off", // Too strict for internal functions
      "jsdoc/require-param-description": "warn",
      "jsdoc/require-returns-description": "warn",

      // ============================================
      // CORRECTNESS CHECKS
      // ============================================
      "jsdoc/check-alignment": "warn",
      "jsdoc/check-param-names": "error",
      "jsdoc/check-tag-names": [
        "error",
        {
          definedTags: [
            "security", // Custom security tag
            "fires", // Custom fires tag
            "remarks", // TSDoc remarks tag
          ],
        },
      ],
      "jsdoc/check-types": "off", // TypeScript already checks types

      // v61+: Check @template names match actual type parameters
      "jsdoc/check-template-names": "warn",

      // ============================================
      // QUALITY CHECKS (v61+ rules)
      // ============================================
      // Ensure documentation is informative (not just repeating the name)
      "jsdoc/informative-docs": [
        "warn",
        {
          excludedTags: ["default"], // @default values are inherently informative
        },
      ],
      // Prevent empty JSDoc block descriptions
      "jsdoc/no-blank-block-descriptions": "warn",

      // ============================================
      // FORMATTING
      // ============================================
      "jsdoc/require-hyphen-before-param-description": "warn",
      "jsdoc/tag-lines": ["warn", "any", { startLines: 1 }],

      // ============================================
      // PROHIBITIONS
      // ============================================
      "jsdoc/no-bad-blocks": "error",
      "jsdoc/no-defaults": "warn",
    },
  },

  // ============================================
  // 8. UNICORN CONFIGURATION (Modern JS/TS patterns)
  // ============================================
  // Updated for eslint-plugin-unicorn v62.0.0
  // Changelog: https://github.com/sindresorhus/eslint-plugin-unicorn/releases
  {
    files: ["**/*.ts", "**/*.tsx"],
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
      "unicorn/prevent-abbreviations": "off", // Allow fn, err, props, params, etc.
      "unicorn/no-null": "off", // null is used in DOM API and some libraries
      "unicorn/prefer-top-level-await": "off", // Not supported everywhere
      "unicorn/no-array-reduce": "warn", // Only warning, reduce is sometimes convenient
      "unicorn/prefer-module": "off", // We already have ESM
      "unicorn/prefer-node-protocol": "off", // Not critical for browser-side code
      "unicorn/filename-case": "off", // We have our own file naming conventions
      "unicorn/no-array-for-each": "off", // forEach is more readable than for-of in some cases
      "unicorn/prefer-spread": "warn",
      "unicorn/prefer-ternary": "warn",
      "unicorn/no-useless-undefined": [
        "warn",
        { checkArguments: false, checkArrowFunctionBody: false },
      ],
      "unicorn/no-typeof-undefined": "off", // Incompatible with typescript-eslint
      "unicorn/expiring-todo-comments": "off", // Incompatible with ESLint 9.27
    },
  },

  // ============================================
  // 9. PROMISE CONFIGURATION
  // ============================================
  {
    files: ["**/*.ts", "**/*.tsx"],
    plugins: {
      promise: promisePlugin,
    },
    rules: {
      ...promisePlugin.configs.recommended.rules,
      "promise/prefer-await-to-then": "off", // Stylistic, not an error
      "promise/prefer-await-to-callbacks": "off", // Stylistic, callbacks are allowed
      "promise/always-return": "error",
      "promise/catch-or-return": "error",
      "promise/no-return-wrap": "error",
      "promise/no-nesting": "warn",
    },
  },

  // ============================================
  // 10. NO-ONLY-TESTS CONFIGURATION (CI/CD protection)
  // ============================================
  {
    files: ["**/tests/**/*.ts", "**/benchmarks/**/*.ts"],
    plugins: {
      "no-only-tests": noOnlyTests,
    },
    rules: {
      "no-only-tests/no-only-tests": "error", // Blocks it.only/describe.only
    },
  },

  // ============================================
  // 11. PRETTIER CONFIGURATION
  // ============================================
  {
    files: ["**/*.ts", "**/*.tsx"],
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
  // 12. SONARJS CONFIGURATION
  // ============================================
  {
    files: ["**/*.ts", "**/*.tsx"],
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
  // 13. VITEST CONFIGURATION (Test Files)
  // ============================================
  {
    files: ["**/tests/**/*.test.ts"],
    plugins: {
      vitest: vitestPlugin,
      "vitest-globals": vitestGlobals,
    },
    languageOptions: {
      globals: vitestGlobals.environments.env.globals,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
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
      "vitest/prefer-expect-type-of": "off", // Conflicts with @typescript-eslint/unbound-method
      "vitest/padding-around-expect-groups": "warn",
      "vitest/consistent-test-filename": "warn",
      "vitest/prefer-strict-equal": "error",
      // Disable some TypeScript rules for tests
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
      "import/no-default-export": "off",
      "import/no-unresolved": "off",
      "prefer-const": "off",
      "prefer-rest-params": "off",
      // JSDoc rules relaxed for test files
      "jsdoc/informative-docs": "off",
    },
  },

  // ============================================
  // 14. BENCHMARK FILES (mitata, tests/benchmarks)
  // ============================================
  {
    files: [
      "**/*.bench.ts",
      "**/*.mitata.ts",
      "**/real-router-benchmarks/modules/**/*.ts",
      "**/tests/benchmarks/**/*.ts",
    ],
    rules: {
      // Disable ALL vitest rules for Mitata benchmarks (not vitest!)
      "vitest/require-hook": "off",
      "vitest/expect-expect": "off",
      "vitest/valid-title": "off",
      "vitest/valid-expect": "off",
      "vitest/no-disabled-tests": "off",
      "vitest/no-focused-tests": "off",
      // Allow any types and unsafe operations in benchmarks
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-unsafe-function-type": "off",
      "@typescript-eslint/no-unused-expressions": "off",
      "@typescript-eslint/use-unknown-in-catch-callback-variable": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      // Allow promise without return for benchmark runners
      "promise/always-return": "off",
      "promise/no-callback-in-promise": "off",
      // Sonarjs rules relaxed for benchmarks
      "sonarjs/constructor-for-side-effects": "off",
      "sonarjs/pseudo-random": "off",
      "sonarjs/no-duplicate-string": "off",
      "sonarjs/different-types-comparison": "off",
      "sonarjs/no-commented-code": "off",
      "sonarjs/function-return-type": "off",
      // Note: sonarjs/void-use allows void for promises (void Promise.resolve())
      // Unicorn rules relaxed for benchmarks
      "unicorn/consistent-function-scoping": "off",
      // Other benchmark-friendly rules
      "@typescript-eslint/explicit-function-return-type": "off",
      "import/no-default-export": "off",
      "import/no-unresolved": "off",
      // JSDoc rules relaxed for benchmarks
      "jsdoc/informative-docs": "off",
    },
  },

  // ============================================
  // 15. TEST HELPERS AND MOCKS (relaxed JSDoc)
  // ============================================
  {
    files: [
      "**/tests/**/*.ts",
      "!**/tests/**/*.test.ts", // Already covered above
    ],
    rules: {
      "jsdoc/informative-docs": "off",
    },
  },

  // ============================================
  // 16. CONFIG FILES (allow Node.js modules)
  // ============================================
  {
    files: [
      "**/*.config.{js,ts,mjs,mts}",
      "**/vitest.setup.ts",
      "**/.claude/**/*.{js,ts}",
    ],
    languageOptions: {
      parserOptions: {
        // Disable type-aware linting for config files
        projectService: false,
      },
    },
    rules: {
      "import/no-default-export": "off",
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/explicit-module-boundary-types": "off",
      "unicorn/prefer-module": "off", // Config files can use CommonJS

      // Disable type-aware rules for config files
      "@typescript-eslint/await-thenable": "off",
      "@typescript-eslint/no-floating-promises": "off",
      "@typescript-eslint/no-misused-promises": "off",
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/no-unnecessary-type-assertion": "off",
      "@typescript-eslint/unbound-method": "off",
    },
  },

  // ============================================
  // 16. TURBO CONFIGURATION (must be last)
  // ============================================
  ...turboConfig,
);
