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
  // TYPESCRIPT INSIDE A COMPONENT
  // The root's blocks for `**/*.ts` apply to a component's script as well.
  // ============================================
  ...eslintConfig
    .filter((block) => block.files?.includes("**/*.ts"))
    .map((block) => ({ ...block, files: ["**/*.svelte"] })),

  // ============================================
  // SVELTE PLUGIN CONFIGURATION
  // ============================================
  ...sveltePlugin.configs["flat/recommended"],
  {
    // The typed rules need a program. The root's TypeScript block, carried
    // over above, gives the project service, and it reads `.svelte` only when
    // told the extension is TypeScript's to parse.
    files: ["**/*.svelte", "**/*.svelte.ts"],
    languageOptions: {
      parser: svelteParser,
      parserOptions: {
        parser: tsEslint.parser,
        extraFileExtensions: [".svelte"],
      },
    },
    rules: {
      // Disable rules that conflict with Svelte
      "import-x/no-mutable-exports": "off",
      "import-x/no-default-export": "off",
    },
  },
  {
    // Prettier has no `.svelte` parser here. Two rune idioms the TypeScript
    // rules misread: `let { … } = $props()` is how props are declared, and
    // the svelte rule knows it; `void x` inside `$effect` reads `x` to make it
    // a dependency without using it.
    files: ["**/*.svelte"],
    rules: {
      "prettier/prettier": "off",
      "prefer-const": "off",
      "svelte/prefer-const": "error",
      "@typescript-eslint/no-meaningless-void-operator": "off",
      "sonarjs/void-use": "off",
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
