// @ts-check

// ============================================
// ESLint Configuration for router-benchmarks
// Extends root config with benchmark-specific overrides
// ============================================

import eslintConfig, { withComponentFiles } from "../eslint.config.mjs";
import tsEslint from "typescript-eslint";

export default tsEslint.config(
  ...eslintConfig,

  {
    // Deck TEMPLATES, not JavaScript: build-deck.mjs string-replaces their
    // `__TOKEN__` placeholders before they become valid JS, so a lint run reads
    // the placeholders as undefined names, and `--fix` could rewrite text the
    // build replaces verbatim.
    ignores: [
      "cross-router/deck/deck-config.js",
      "cross-router/deck/deck-render.js",
    ],
  },

  {
    files: ["*.mjs", "*.js"],
    extends: [tsEslint.configs.disableTypeChecked],
  },

  // The apps' components (`.svelte`) take the same relaxations as their `.ts`.
  ...withComponentFiles([
    {
      // ⚠ The measured program. `cross-router/apps` are the shells the reference
      // results were measured on, and `adapter-bench/apps` build the bundles
      // CodSpeed measures. A fix here must leave the built bundle byte-identical,
      // or the results stop describing the code (#2390). Each rule below can only
      // be satisfied by changing that program — hoisting a closure, dropping a
      // guard, reordering class fields, renaming a component input — so it is off
      // here.
      files: [
        "cross-router/apps/**/*.{ts,tsx}",
        "adapter-bench/apps/**/*.{ts,tsx}",
      ],
      rules: {
        "id-length": "off",
        // Rollup emits modules in import order, so reordering an app's imports
        // reorders its bundle: measured, it changed 21 of the 139.
        "import-x/order": "off",
        // esbuild keeps a template literal a template: `"/sec" + x` rewritten as
        // `` `/sec${x}` `` changed 7 bundles.
        "prefer-template": "off",
        "unicorn/consistent-function-scoping": "off",
        "@typescript-eslint/no-unnecessary-condition": "off",
        "@typescript-eslint/member-ordering": "off",
        "@typescript-eslint/no-confusing-void-expression": "off",
        "@typescript-eslint/require-await": "off",
        "unicorn/prefer-at": "off",
        "unicorn/prefer-global-this": "off",
        // Angular declares a component or module by its class, so an empty one is
        // the declaration itself.
        "@typescript-eslint/no-extraneous-class": "off",
        // `@jsxImportSource` is a compiler pragma, not a JSDoc tag.
        "jsdoc/check-tag-names": [
          "error",
          { definedTags: ["security", "fires", "remarks", "jsxImportSource"] },
        ],
      },
    },

    {
      // `adapter-bench` builds with `minify: false`, so renaming a parameter or
      // writing `params["id"]` as `params.id` changes the bundle text.
      files: ["adapter-bench/apps/**/*.{ts,tsx}"],
      rules: {
        "@typescript-eslint/dot-notation": "off",
        "unicorn/name-replacements": "off",
        // Typing a route param as `string` makes `String(param)` redundant, and
        // removing that call changed five of the six adapter bundles.
        "@typescript-eslint/no-base-to-string": "off",
      },
    },
  ]),

  {
    // sv-router's route table imports the components it renders, and they
    // import `route` back from it: the cycle is the router's API. Breaking it
    // moves code between modules, and rollup emits modules in import order.
    files: ["cross-router/apps/svelte/sv-router/**/*.svelte"],
    rules: { "import-x/no-cycle": "off" },
  },

  {
    // The CodSpeed benches run under tsx, not from a bundle, so no build can
    // prove a fix inert — and even `void` adds an instruction to the measured
    // function.
    files: ["adapter-bench/benches/**/*.mts"],
    rules: {
      "@typescript-eslint/no-floating-promises": "off",
      // `../dist/<fw>/app.mjs` exists only after `prebuild:adapter`.
      "import-x/no-unresolved": "off",
    },
  },

  {
    // These entries import `./packages/*/src`, a tree `git archive` materialises
    // at bundle time, so it is absent by construction.
    files: ["seam-rig/entry-*.ts"],
    rules: { "import-x/no-unresolved": "off" },
  },
);
