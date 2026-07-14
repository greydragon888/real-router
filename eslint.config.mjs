// @ts-check

// ============================================
// ESLint 10.1+ Configuration
// Using globalIgnores helper with typescript-eslint
// ============================================

import { fileURLToPath } from "node:url";
import path from "node:path";
import { globalIgnores, includeIgnoreFile } from "eslint/config";
import eslint from "@eslint/js";
import stylistic from "@stylistic/eslint-plugin";
import tsEslint from "typescript-eslint";
import eslintPluginPrettierRecommended from "eslint-plugin-prettier/recommended";
import sonarjsPlugin from "eslint-plugin-sonarjs";
import vitestPlugin from "@vitest/eslint-plugin";
import turboConfig from "eslint-config-turbo/flat";
import importX from "eslint-plugin-import-x";
import { createTypeScriptImportResolver } from "eslint-import-resolver-typescript";
import jsdoc from "eslint-plugin-jsdoc";
import unicorn from "eslint-plugin-unicorn";
import noOnlyTests from "eslint-plugin-no-only-tests";
import security from "eslint-plugin-security";

const gitignorePath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".gitignore",
);

// ============================================
// v66/v67 unicorn rules — NON-SHIPPED carve-out
// ============================================
// Adopted for production `src` only. Tests, benchmarks and test helpers keep the
// v65 surface — these rules fire on idiomatic non-shipped patterns (callback
// `push`, deeply-nested `expect()`, `forEach`, boundary constants, `break` in
// nested loops) where modernizing is pure churn with no shipped value. Applied
// via the broad files block (section 13.4) so .test/.properties/.stress/helpers/
// *.bench.ts/benchmarks/** are all covered regardless of file naming.
/** @type {import("eslint").Linter.RulesRecord} */
const UNICORN_NON_SHIPPED_OFF = {
  "unicorn/no-for-each": "off",
  "unicorn/no-return-array-push": "off",
  "unicorn/no-break-in-nested-loop": "off",
  "unicorn/no-optional-chaining-on-undeclared-variable": "off",
  "unicorn/no-global-object-property-assignment": "off",
  "unicorn/no-error-property-assignment": "off",
  "unicorn/no-unreadable-for-of-expression": "off",
  "unicorn/no-duplicate-loops": "off",
  "unicorn/no-unnecessary-splice": "off",
  "unicorn/no-useless-else": "off",
  "unicorn/no-useless-template-literals": "off",
  "unicorn/prefer-number-coercion": "off",
  "unicorn/prefer-type-literal-last": "off",
  "unicorn/prefer-object-iterable-methods": "off",
  "unicorn/prefer-array-from-map": "off",
  "unicorn/prefer-object-define-properties": "off",
  // Adopted opt-in rule, but tests use innerHTML for DOM fixtures (48 sites):
  "unicorn/no-unsafe-dom-html": "off",
  // Pre-existing rules whose v66/v67 detection newly reached test/bench files:
  "unicorn/no-useless-fallback-in-spread": "off",
  "unicorn/prefer-at": "off",
  "unicorn/prefer-object-from-entries": "off",
  // v68 new recommended rules — idiomatic in non-shipped code, churn with no
  // shipped value (see .claude/unicorn-v68-rules-audit.md):
  "unicorn/prefer-promise-with-resolvers": "off", // adopted in src; tests build raw Promises
  "unicorn/prefer-continue": "off", // adopted in src; loop style in tests/bench is fine
  "unicorn/consistent-conditional-object-spread": "off",
  "unicorn/prefer-array-from-async": "off",
  "unicorn/prefer-math-constants": "off", // tests use literal floats (3.14159 ≠ Math.PI) intentionally
  "unicorn/no-duplicate-if-branches": "off", // stress tests deliberately exercise identical branches
  "unicorn/no-nonstandard-builtin-properties": "off", // proto-pollution tests touch nonstandard Symbol props
};

export default tsEslint.config(
  // ============================================
  // 1. GLOBAL IGNORES (ESLint 9.30+ globalIgnores helper)
  // ============================================
  // ESLint 10.4+ includeIgnoreFile(): inherit .gitignore patterns
  // (build artifacts, .stryker-tmp, .turbo, .angular, .svelte-kit, tools/, .spike/, etc.)
  includeIgnoreFile(gitignorePath, "Imported .gitignore patterns"),
  globalIgnores([
    "**/*.min.js",
    "**/*.d.ts",
    "**/generated/**",
    "**/*.bak*", // Backup files
    "**/*.mjs", // JS config files - no TypeScript type-checking needed
    "cz.config.js", // cz-git configuration
    ".changeset/**", // Changesets configuration and markdown files
    "**/e2e/**", // Playwright e2e tests — not type-checked by ESLint
    "**/benchmarks/audit-probes/**", // ad-hoc /deep-audit diagnostic probes — linter disabled
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
      // ESLint v10 RULES (now in eslint:recommended)
      // ============================================
      // v10: Detects useless assignments (dead code)
      // In eslint:recommended as "error" since v10 — keep as "warn" for gradual adoption
      "no-useless-assignment": "warn",
    },
  },

  // ============================================
  // 4. STYLISTIC RULES (all files)
  // ============================================
  // Updated for @stylistic/eslint-plugin v5.10.0
  // Changelog: https://github.com/eslint-stylistic/eslint-stylistic/releases
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
  // Updated for typescript-eslint v8.58.0
  // Changelog: https://github.com/typescript-eslint/typescript-eslint/releases
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
      "@typescript-eslint/unbound-method": "off",

      // v8.50.0: Detect useless default assignments (x = undefined)
      "@typescript-eslint/no-useless-default-assignment": "warn",

      // v8.58.0: Flag unnecessary explicit type arguments that match defaults
      "@typescript-eslint/no-unnecessary-type-arguments": "error",

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
      // isolate(produce()) GUARD — throw-isolation class (#1477)
      // ============================================
      // An isolation wrapper must receive a RECIPE (a name / thunk), never a
      // pre-produced value: passing a factory/compile CALL as its isolated
      // argument evaluates the produce BEFORE the wrapper's try/catch (JS
      // argument-evaluation order), leaking the produce-throw. This is the
      // structural preventer for the throw-isolation class (#767 → #798 → #1222
      // → #1476) that #1039 decreed but never built. Extend the selector list as
      // new isolation wrappers are added — each `<wrapper>(produce())` re-opens
      // the same anti-pattern. (Shape 2 — a lazy `producer().then().catch()`
      // whose sync throw escapes the async-only `.catch`, #806/#1476 — is not
      // syntactically distinguishable from any promise chain, so it is guarded by
      // a per-site sync-throw test at each producer, not by this rule.)
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.name='runHook'][arguments.0.type='CallExpression']",
          message:
            "isolate(produce()) anti-pattern (#1222/#1477): pass a recipe (the hook NAME), not a produced value, to runHook — `runHook(compileHook(...))` evaluates the factory outside runHook's try/catch and leaks a compile-throw that swallows sibling hooks. Use `runHook(hookName, routeName, toState, fromState)`.",
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
  // Migrated to eslint-plugin-import-x (actively maintained fork)
  // https://github.com/un-ts/eslint-plugin-import-x
  // Key advantages over eslint-plugin-import:
  // - 16 deps vs 117, Rust-based unrs-resolver
  // - Native package.json exports support
  // - Active maintenance and flat config support
  {
    plugins: {
      "import-x": importX,
    },
    settings: {
      "import-x/resolver-next": [
        createTypeScriptImportResolver({
          alwaysTryTypes: true,
          conditionNames: [
            "@real-router/internal-source",
            "types",
            "import",
            "esm2020",
            "es2020",
            "es2015",
            "require",
            "node",
            "node-addons",
            "browser",
            "default",
          ],
          project: ["./tsconfig.json", "packages/*/tsconfig.json"],
        }),
      ],
    },
    rules: {
      ...importX.flatConfigs.recommended.rules,
      ...importX.flatConfigs.typescript.rules,
      "import-x/order": [
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
      "import-x/no-nodejs-modules": "off",
      "import-x/no-commonjs": "error",
      "import-x/no-unresolved": "error", // ✅ Enabled thanks to typescript resolver
      // Prevent duplicate imports, prefer separate type imports
      // Works in tandem with @typescript-eslint/consistent-type-imports
      "import-x/no-duplicates": [
        "error",
        {
          "prefer-inline": false, // Keep type imports separate, not inline
        },
      ],
      "import-x/no-cycle": ["error", { maxDepth: 3 }],
      "import-x/no-self-import": "error",
      "import-x/no-useless-path-segments": "error",
      "import-x/first": "error",
      "import-x/newline-after-import": "error",
      "import-x/no-default-export": "warn",
      // Ensure all imports are declared in package.json dependencies
      // Catches missing deps like "logger" that work due to hoisting
      // Only for src/ files - tests have too many false positives in monorepo
      "import-x/no-extraneous-dependencies": [
        "error",
        {
          devDependencies: true,
          optionalDependencies: false,
          peerDependencies: true,
        },
      ],
    },
  },

  // ============================================
  // 7. JSDOC CONFIGURATION (for public APIs)
  // ============================================
  // Updated for eslint-plugin-jsdoc v62.8.1
  // Changelog: https://github.com/gajus/eslint-plugin-jsdoc/releases
  {
    files: [
      "**/src/**/*.ts",
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

      // Ensure a documented @returns matches an actual return statement
      // (catches stale docs after refactors)
      "jsdoc/require-returns-check": "warn",

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
      // NOTE: jsdoc/no-multi-asterisks intentionally NOT enabled — its
      // preventAtEnd autofix strips the leading `*` from compact closings
      // like `* text */` (the dominant multi-line style here), corrupting
      // valid comments. Cannot distinguish that from the `**/` typo it targets.

      // ============================================
      // PROHIBITIONS
      // ============================================
      "jsdoc/no-bad-blocks": "error",
      "jsdoc/no-defaults": "warn",
      // TS-first: types belong in the TypeScript signature, not in JSDoc
      // (mirrors check-types: off — no redundant/stale type annotations in docs)
      "jsdoc/no-types": "warn",
    },
  },

  // ============================================
  // 8. UNICORN CONFIGURATION (Modern JS/TS patterns)
  // ============================================
  // Updated for eslint-plugin-unicorn v69.0.0
  // Changelog: https://github.com/sindresorhus/eslint-plugin-unicorn/releases
  // v68 audit (38 new rules + prevent-abbreviations→name-replacements rename):
  // .claude/unicorn-v68-rules-audit.md
  // v69 audit (12 new rules, all in `recommended`; 3 declined below):
  // .claude/unicorn-v69-rules-audit.md
  {
    files: ["**/*.ts", "**/*.tsx"],
    plugins: {
      unicorn,
    },
    rules: {
      ...unicorn.configs.recommended.rules,

      // ============================================
      // NEW RULES (v56-v64)
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

      // v63: Functions without `this` should be standalone, not methods
      "unicorn/isolated-functions": "warn",

      // v64: Enforce consistent escaping in template literals
      "unicorn/consistent-template-literal-escape": "error",
      // v64: Disallow unnecessary Iterator#toArray() calls
      "unicorn/no-useless-iterator-to-array": "error",
      // v64: Put simpler condition first in logical expressions
      "unicorn/prefer-simple-condition-first": "warn",
      // v64: Enforce consistent break position in switch cases
      "unicorn/switch-case-break-position": "warn",

      // ============================================
      // v66/v67 OPT-IN rule adopted (recommended:false → explicit enable)
      // ============================================
      // NOTE: `custom-error-definition` was evaluated and NOT adopted — the public
      // `RouterError` uses a `(code, { … })` constructor that conflicts with the
      // rule's rigid `(message, options)` requirement (unsatisfiable without a
      // breaking redesign of RouterError's public API). The dead route-tree error
      // classes it flagged were deleted as genuine cleanup, and `RouterError` got
      // the one valuable finding (`this.name`) applied standalone. See
      // .claude/unicorn-v67-rules-audit.md.
      //
      // Security guard against unsafe DOM HTML sinks (innerHTML/outerHTML/
      // insertAdjacentHTML) in dom-utils. 0 prod today — forward-looking XSS
      // guard. Off in non-shipped code below (tests use innerHTML for fixtures).
      "unicorn/no-unsafe-dom-html": "error",

      // ============================================
      // DISABLED RULES (too strict or unsuitable)
      // ============================================
      // The library ships a custom Node-style EventEmitter (the `event-emitter`
      // package) by design — a view-agnostic core cannot depend on the DOM
      // `EventTarget`. The rule fired on every internal `new EventEmitter()` in
      // src, tests and benchmarks, so it is off globally rather than per-site.
      "unicorn/prefer-event-target": "off",
      "id-length": [
        "error",
        {
          min: 2,
          exceptions: ["_", "i", "j"],
        },
      ],
      // v68: `prevent-abbreviations` renamed to `name-replacements` (options 1:1).
      "unicorn/name-replacements": [
        "error",
        {
          // File naming is the project's domain (cf. `unicorn/filename-case: off`).
          // v68 default replacements newly flag filenames like `configuration.bench.ts`.
          checkFilenames: false,
          replacements: {
            i: false,
            idx: false,
            j: false,
            fn: false,
            args: false,
            arg: false,
            obj: false,
            arr: false,
            opts: false,
            cb: false,
            params: false,
            param: false,
            err: false,
            std: false,
            dev: false,
            stdDev: false,
            prod: false,
            val: false,
            util: false,
            utils: false,
            def: false,
            defs: false,
            str: false,
            evt: false,
            num: false,
            nums: false,
            acc: false,
            ctx: false,
            ref: false,
            refs: false,
            prop: false,
            props: false,
            msg: false,
            msgs: false,
            env: false,
            dist: false,
            prev: false,
            curr: false,
            // v68 added these to default replacements; all are domain vocabulary
            // here (dependency-injection `deps`, proto-pollution test `proto`,
            // benchmark `perf`) — keep them allowed, matching the rest of this map.
            dep: false,
            deps: false,
            proto: false,
            perf: false,
            ident: false, // fast-check `arbIdent` in property tests
            idents: false,
          },
        },
      ], // Allow fn, err, props, params, deps, proto, perf, etc.
      "unicorn/no-null": "off", // null is used in DOM API and some libraries
      "unicorn/prefer-top-level-await": "off", // Not supported everywhere
      "unicorn/no-array-reduce": "warn", // Only warning, reduce is sometimes convenient
      "unicorn/prefer-module": "off", // We already have ESM
      "unicorn/prefer-node-protocol": "warn", // Replaces import/enforce-node-protocol-usage
      "unicorn/filename-case": "off", // We have our own file naming conventions
      // v66 renamed `no-array-for-each` → `no-for-each` (unopinionated → ON via
      // recommended). Enforced in production src: 0 violations — the only
      // `.forEach` is React's `Children.forEach(children, cb)`, a 2-arg call the
      // rule ignores (it matches only single-arg `<receiver>.forEach(cb)`). The
      // rule is turned OFF for tests below (section 12) to avoid churning 165
      // readable test usages into `for…of`.
      "unicorn/prefer-spread": "warn",
      "unicorn/prefer-ternary": "warn",
      "unicorn/no-useless-undefined": [
        "warn",
        { checkArguments: false, checkArrowFunctionBody: false },
      ],
      "unicorn/no-typeof-undefined": "off", // Incompatible with typescript-eslint
      "unicorn/expiring-todo-comments": "off", // Incompatible with ESLint 9.27

      // v65: the new recommended rules were temporarily disabled for the
      // eslint-plugin-unicorn 64 → 65 bump (#706); #712 migrated the code and
      // RE-ENABLED 7 of them — they now run at their recommended `error` level
      // with no override here: no-array-from-fill, no-array-fill-with-reference-type,
      // prefer-includes-over-repeated-comparisons, no-this-outside-of-class,
      // prefer-array-some, consistent-compound-words, better-dom-traversing.
      //
      // `require-css-escape` is intentionally left OFF (#712 decision). Its whole
      // value is preventing CSS-selector injection from UNTRUSTED interpolation —
      // but every site it flagged here is a static constant (the announcer's
      // `data-real-router-announcer` attr) or a test-controlled value (testids,
      // loop indices, route names the test itself generates). None carry an
      // injection vector, so the rule guards nothing real, while enabling it cost
      // a jsdom `CSS.escape` polyfill (jsdom@29 ships no global `CSS`) plus
      // `CSS.escape(...)` wrapping of provably-safe values. The router never
      // builds selectors from untrusted data, so the forward-looking value is
      // marginal too. Re-enable if that changes.
      "unicorn/require-css-escape": "off",

      // ============================================
      // v66/v67 (#NNN) — DISABLED globally. The 66.0.0 release added ~74 rules and
      // 67.0.0 another ~16; most we adopt via `recommended`. The ones below are
      // declined for the documented reason. Lean adoption: enforce the high-value
      // bug-catchers + safe modernizations in production `src`, decline the rest.
      // ============================================

      // --- Hard conflict with another active rule ---
      // Two member-order rules → fighting autofixes. The typescript-eslint rule
      // above (with its detailed group config) is the single source of truth.
      "unicorn/consistent-class-member-order": "off",

      // --- Fights INTENTIONAL architecture patterns (false positives by design) ---
      // Module-level memoization caches (e.g. transitionPath.ts `cached1Result`)
      // are assigned from inside the memoized fn — that IS the optimization.
      "unicorn/no-top-level-assignment-in-function": "off",
      // The router looks up routes/params by dynamic key (`name in routes`) all
      // over core — that is the data model, not a smell.
      "unicorn/no-computed-property-existence-check": "off",
      // Frozen constants / module-init in the namespaces are deliberate top-level
      // effects (immutability, registration), not accidental side effects.
      "unicorn/no-top-level-side-effects": "off",
      // The DI store, RouterError#toJSON, etc. copy via `for (key in obj)` with a
      // string key — legitimate dynamic-key iteration, same model the rule above
      // fights. The "unsafe key" here is a plain `string`, not an injection vector.
      "unicorn/no-unsafe-property-key": "off",

      // --- Semantic / coverage-annotation risk (not mechanical) ---
      // `Number.isInteger()` → `Number.isSafeInteger()` is a BEHAVIOR change
      // (rejects > 2^53); our checked values are small/bounded (status codes,
      // cache sizes), so isInteger is correct and clearer. No autofix by design.
      "unicorn/prefer-number-is-safe-integer": "off",
      // The autofix relocates code across `/* v8 ignore next N */` boundaries
      // (e.g. preact/Await.tsx), mis-targeting our precise coverage annotations
      // and silently regressing the 100%-coverage gate. Control-flow inversion is
      // not worth that risk; declined repo-wide.
      "unicorn/prefer-early-return": "off",

      // --- Naming / style opinions (high churn, low value here) ---
      // Would rename 154 internal boolean identifiers (is/has/should/…); pure
      // convention, and auto-renaming identifiers risks touching the API surface.
      "unicorn/consistent-boolean-name": "off",
      "unicorn/no-non-function-verb-prefix": "off",
      "unicorn/prefer-short-arrow-method": "off",
      // Would rewrite the `_private` underscore convention to `#private` fields —
      // a runtime-semantics change (hard-private), not a lint fix.
      "unicorn/prefer-private-class-fields": "off",
      // Promise chaining is a legitimate style; no autofix, ~600 sites of churn.
      "unicorn/prefer-await": "off",
      "unicorn/prefer-minimal-ternary": "off",
      "unicorn/max-nested-calls": "off",

      // --- Library runtime-target risk (push toward too-new runtime APIs) ---
      // `Iterator#toArray()` is ES2025 (Node 22+, limited browsers) — unsafe to
      // emit from a library that targets a broad range of consumer runtimes.
      "unicorn/prefer-iterator-to-array": "off",
      // `Array#toSpliced()` is ES2023 AND changes mutate→copy semantics.
      "unicorn/no-array-splice": "off",
      // v69: `Set.prototype.difference/intersection/…` are ES2024 (Node 22+,
      // Chrome 122+/Safari 17+/FF 127+). The 2 src hits (validation-plugin
      // forwardTo/retrospective param-diff) are `[...a].filter(x => !b.has(x))`
      // — same broad-runtime-target risk as prefer-iterator-to-array. No autofix
      // here either, so adopting would be a manual rewrite onto a too-new API.
      "unicorn/prefer-set-methods": "off",
      // v69: `Promise.try()` is ES2025 (Node 22+, Chrome 128+). Same target risk.
      // All current hits are in tests/bench, but declined repo-wide to keep the
      // shipped surface off the new API by default.
      "unicorn/prefer-promise-try": "off",

      // --- Low-value stylistic whose ONLY prod sites are the symlinked shared
      // sources (shared/browser-env, shared/dom-utils). Those lint under several
      // path views (packages/dom-utils/src/X vs packages/angular/src/dom-utils/X
      // vs adapter symlinks), so a `files` glob carve-out is unreliable — and
      // shared/dom-utils is frozen (no cleanliness refactors, hand-synced angular
      // copy). Not worth it for escape-style / `Infinity` / decl-ordering. ---
      "unicorn/prefer-unicode-code-point-escapes": "off",
      "unicorn/prefer-global-number-constants": "off",
      "unicorn/no-declarations-before-early-exit": "off",

      // ============================================
      // v69 (#NNN) — 12 new rules, all land in `recommended`. 9 have zero hits
      // and are adopted for free as forward-guards. 3 declined (see
      // .claude/unicorn-v69-rules-audit.md); the two runtime-target-risk ones
      // (prefer-set-methods, prefer-promise-try) sit in that subsection above.
      // ============================================
      // `Element#replaceChildren()` is widely supported (safe API, not a runtime
      // risk), but all 38 hits are non-shipped test/property fixtures emptying a
      // node via a `while (el.firstChild) el.removeChild(...)` loop — 0 prod
      // sites. Modernizing test scaffolding is pure churn with no shipped value,
      // so it is declined repo-wide rather than carved out per-file.
      "unicorn/prefer-dom-node-replace-children": "off",
    },
  },

  // ============================================
  // 9. NO-ONLY-TESTS CONFIGURATION (CI/CD protection)
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
  // 10. PRETTIER CONFIGURATION
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
  // 11. SONARJS CONFIGURATION
  // ============================================
  // Updated for eslint-plugin-sonarjs v4.1.0
  // Repo moved from archived SonarSource/eslint-plugin-sonarjs to SonarSource/SonarJS
  // Changelog: https://github.com/SonarSource/SonarJS/blob/master/packages/analysis/src/jsts/rules/CHANGELOG.md
  // v4 breaking: removed enforce-trailing-comma, super-invocation (covered by eslint core)
  // v4 new: hardcoded-secret-signatures, dynamically-constructed-templates,
  //         review-blockchain-mnemonic, no-session-cookies-on-static-assets (all recommended)
  // v4.1.0: dropped 11 security-hotspot rules (cookies, encryption, sockets, …);
  //         added 10 recommended rules — 6 fire zero violations (kept on); the
  //         3 test-assertion/float ones below are disabled (see rules), and the
  //         new ReDoS rule super-linear-regex is kept on (inline-disabled at the
  //         3 already-vetted bounded-input regexes in path-matcher, alongside slow-regex)
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

      // Perf: disable expensive SonarJS rules that either scan heuristically or
      // duplicate cheaper/dedicated checks. Measured on core via TIMING; together
      // these dominated lint rule-time.
      //  - no-commented-code: NLP heuristic over every comment (~79s, 78-81%)
      //  - deprecation: duplicate of @typescript-eslint/no-deprecated (already
      //    on via strictTypeChecked, ~3.7x cheaper — same S1874 check)
      //  - assertions-in-tests: duplicate of the (intentionally disabled)
      //    vitest/expect-expect; chai/sinon-oriented, false-positives under vitest
      //  - no-redundant-assignments: dataflow code-smell, partly covered by ts-eslint
      //  - aws-restricted-ip-admin-access: irrelevant for a client-side router
      "sonarjs/no-commented-code": "off",
      "sonarjs/aws-restricted-ip-admin-access": "off",
      "sonarjs/deprecation": "off",
      "sonarjs/assertions-in-tests": "off",
      "sonarjs/no-redundant-assignments": "off",

      // v4.0.0: New security rules — disable irrelevant for client-side router
      "sonarjs/review-blockchain-mnemonic": "off",
      "sonarjs/no-session-cookies-on-static-assets": "off",

      // v4.1.0: New recommended test-assertion / float rules — disabled as
      // false positives or deliberate idioms for this codebase:
      //  - no-floating-point-equality: exact literal / mock values (e.g.
      //    Number("12.5") === 12.5), not float arithmetic
      //  - no-trivial-assertions: intentional `expect(true).toBe(true)` reach
      //    markers in stress/property tests + type-level `Equal` assertions
      // (prefer-specific-assertions adopted in tests — #915)
      "sonarjs/no-floating-point-equality": "off",
      "sonarjs/no-trivial-assertions": "off",
    },
  },

  // ============================================
  // 11b. SECURITY (eslint-plugin-security) — SHIPPED src only
  // ============================================
  // Fast, in-process SAST in the existing lint pass: flags eval / non-literal
  // child_process / non-literal regexp / pseudo-random for security / unsafe
  // buffer, etc. Scoped to `**/src/**` (shipped code) — tests/benchmarks build
  // throwaway inputs that trip these rules with no shipped risk.
  //
  // Three recommended rules are OFF as structural false positives for a
  // client-side router library (kept narrow — the high-signal rules like
  // detect-unsafe-regex, detect-eval-with-expression, detect-child-process stay
  // ON). Complements CodeQL (cloud, deep taint) + semgrep diff scan (pre-push) —
  // see IMPLEMENTATION_NOTES "Local SAST".
  //
  //  - detect-object-injection: fires on EVERY `obj[variable]` (`map[name]`,
  //    `params[key]`) — ~100% false positives in a router.
  //  - detect-non-literal-regexp: the matcher builds RegExps from route
  //    *definitions* (constraint patterns) — trusted developer config, not user
  //    input, so non-literal here is by design, not an injection vector.
  //  - detect-possible-timing-attacks: there is no secret/credential comparison
  //    in a view-layer router — every hit is a plain boolean/string equality.
  {
    files: ["**/src/**/*.ts", "**/src/**/*.tsx"],
    plugins: {
      security,
    },
    rules: {
      ...security.configs.recommended.rules,
      "security/detect-object-injection": "off",
      "security/detect-non-literal-regexp": "off",
      "security/detect-possible-timing-attacks": "off",
    },
  },

  // ============================================
  // 12. VITEST CONFIGURATION (Test Files)
  // ============================================
  {
    files: [
      "**/tests/**/*.test.ts",
      "**/tests/**/*.test.tsx",
      "**/tests/**/*.properties.ts",
      "**/tests/**/helpers.ts",
      "**/tests/**/helpers.tsx",
      "**/tests/**/*.stress.ts",
      "**/tests/**/*.stress.tsx",
    ],
    plugins: {
      vitest: vitestPlugin,
    },
    languageOptions: {
      globals: vitestPlugin.configs.env.languageOptions.globals,
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
      // v1.6.4: Prefer mockReturnValue over mockImplementation(() => value)
      // NOT enabled: autofix is unsafe — breaks mockImplementation with dynamic expressions
      // e.g. mockImplementation(() => timestamps[callIndex++]) → mockReturnValue(timestamps[callIndex++])
      // "vitest/prefer-mock-return-shorthand": "warn",
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
      "@typescript-eslint/require-await": "off",
      "sonarjs/no-redundant-jump": "off",
      "@typescript-eslint/no-shadow": "off",
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/unbound-method": "off", // Conflicts with expect.any() in Vitest
      "sonarjs/no-commented-code": "off",
      "sonarjs/no-duplicate-string": "off",
      "sonarjs/function-return-type": "off",
      "sonarjs/different-types-comparison": "off",
      "sonarjs/no-unused-collection": "off",
      "no-useless-assignment": "off", // Common test pattern: callIndex++ in mock setup
      "no-unassigned-vars": "off", // Common test pattern: let unsubscribe in describe scope, assigned in beforeEach
      "unicorn/consistent-function-scoping": "off",
      // v66/v67 new-rule carve-out for non-shipped code is applied separately via
      // a broad files block (see UNICORN_NON_SHIPPED_OFF) so it also covers
      // *.bench.ts / benchmarks/** and arbitrarily-named test helpers.
      "import-x/no-default-export": "off",
      "import-x/no-unresolved": "off",
      "import-x/no-extraneous-dependencies": "off",
      "prefer-const": "off",
      "prefer-rest-params": "off",
      // JSDoc rules relaxed for test files
      "jsdoc/informative-docs": "off",
      "id-length": "off",
    },
  },

  // ============================================
  // 12.1 PROPERTY-BASED TESTS (@fast-check/vitest)
  // ============================================
  {
    files: ["**/tests/**/*.properties.ts"],
    rules: {
      // Property tests use different patterns than regular tests
      "vitest/require-hook": "off",
      "vitest/no-standalone-expect": "off",
      "vitest/no-test-return-statement": "off",
      // Property tests often need conditional assertions based on generated data
      "vitest/no-conditional-in-test": "off",
      "vitest/no-conditional-expect": "off",
      // test/it come from @fast-check/vitest, not vitest — fixer would add duplicate imports
      "vitest/prefer-importing-vitest-globals": "off",
    },
  },

  // ============================================
  // 13. BENCHMARK FILES (mitata, tests/benchmarks)
  // ============================================
  {
    files: [
      "**/*.bench.ts",
      "**/*.mitata.ts",
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
      "import-x/no-default-export": "off",
      "import-x/no-unresolved": "off",
      "import-x/no-extraneous-dependencies": "off",
      // JSDoc rules relaxed for benchmarks
      "jsdoc/informative-docs": "off",
      "id-length": "off",
    },
  },

  // ============================================
  // 13.1 EXAMPLES (demo apps — relaxed library-grade rules)
  // ============================================
  // Examples are demonstration apps, not library code.
  // Many library-grade rules (default exports for framework boilerplate,
  // explicit module boundary types on demo helpers, etc.) add noise without value.
  {
    files: ["examples/**/*.ts", "examples/**/*.tsx"],
    rules: {
      // Default exports are idiomatic for framework entry components.
      "import-x/no-default-export": "off",
      // Demo-grade signatures — return-type inference is fine.
      "@typescript-eslint/explicit-module-boundary-types": "off",
      "@typescript-eslint/explicit-function-return-type": "off",
      // Demo data uses simple loops/conditions; cognitive complexity bumps are fine.
      "sonarjs/cognitive-complexity": "off",
      // Demo IDs (e.g. `id`) are fine.
      "id-length": "off",
      // Demos use Math.random for data generation — not security-sensitive.
      "sonarjs/pseudo-random": "off",
      // Loader factories `() => (params) => ...` and similar nested
      // arrow patterns are idiomatic for the router API.
      "unicorn/consistent-function-scoping": "off",
      // Demo Promise chains in click handlers / hooks frequently pattern as
      // `void promise` — the explicit `void` is intentional, the rule
      // misreads it.
      "@typescript-eslint/no-floating-promises": "off",
      // React/Vue event handlers naturally take async callbacks.
      "@typescript-eslint/no-misused-promises": "off",
      // `params.id as string` is a frequent demo idiom for nested params
      // typed as Params (Record<string, unknown>).
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      // Demo data structures use mutable arrays/objects — readonly mods
      // would clutter the examples without illustrating router behavior.
      "sonarjs/prefer-read-only-props": "off",
      // Demo abbreviations (id, e, ev) are fine in component bodies.
      "unicorn/prevent-abbreviations": "off",
    },
  },

  // ============================================
  // 13.2 ANGULAR COMPONENT FILES (decorator-only classes)
  // ============================================
  // Angular components are decorator-driven; the class itself is a metadata
  // anchor for @Component(). Many lint rules trip false positives here.
  {
    files: ["examples/web/angular/**/*.component.ts"],
    rules: {
      // @Component metadata classes legitimately have no instance members.
      "@typescript-eslint/no-extraneous-class": "off",
      // Field decorators (signal(), computed(), input()) define members in
      // declaration order — re-ordering them obscures the component shape.
      "@typescript-eslint/member-ordering": "off",
      // Angular signal types (Signal<T>, InputSignal<T>) read as
      // "always-truthy" to TS, but the framework wraps them in callable values.
      "@typescript-eslint/no-unnecessary-condition": "off",
    },
  },

  // ============================================
  // 13.3 NON-SHIPPED CODE — v66/v67 unicorn carve-out
  // ============================================
  // Tests, benchmarks, and test helpers (ANY file name) — see the
  // UNICORN_NON_SHIPPED_OFF rationale near the top of this file. Broad coverage so
  // *.bench.ts and arbitrarily-named helpers (mockPlugins.ts, test-utils.ts) are
  // all included, not just the narrow set section 12 matches.
  {
    files: [
      "**/tests/**/*.ts",
      "**/tests/**/*.tsx",
      "**/*.bench.ts",
      "**/*.mitata.ts",
      "**/benchmarks/**/*.ts",
      "**/benchmarks/**/*.tsx",
    ],
    rules: UNICORN_NON_SHIPPED_OFF,
  },

  // ============================================
  // 14. TEST HELPERS AND MOCKS (relaxed JSDoc)
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
  // 15. CONFIG FILES (allow Node.js modules)
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
      "import-x/no-default-export": "off",
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
  // eslint-config-turbo v2.9.1
  ...turboConfig,
  {
    // eslint-config-turbo does not read global.env from turbo.json
    // when futureFlags.globalConfiguration is enabled — allowList global env vars
    rules: {
      "turbo/no-undeclared-env-vars": [
        "error",
        { allowList: ["BENCH_ROUTER", "BENCH_NO_VALIDATE", "BENCH_SECTIONS"] },
      ],
    },
  },
);
