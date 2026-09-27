// A component's script is linted by the examples' rules for `**/*.ts`, and
// `eslint.config.mjs` here names the rules that differ for a component (#2407,
// #2556). A lint run cannot hold this: a rule dropped from, or an exception
// widened to, a file kind with nothing to report leaves the run green. So each
// cell asks ESLint which rules reach a file of each kind.
//
// The config imports what only this workspace installs, so the cells run here
// rather than in `scripts/tests/`, which asks the same of the root config:
// `pnpm test:lint-config` in `examples/`, and the weekly `examples.yml` lint
// job.

import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { ESLint } from "eslint";

const EXAMPLES = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const eslint = new ESLint({ cwd: EXAMPLES });

async function configOf(file) {
  const config = await eslint.calculateConfigForFile(file);

  assert.ok(config, `${file} has no config`);

  return config;
}

/** A rule's severity for a file: 0 off, 1 warn, 2 error, undefined absent. */
async function severities(file, rules) {
  const { rules: configured } = await configOf(file);

  return Object.fromEntries(rules.map((rule) => [rule, configured[rule]?.[0]]));
}

const EXAMPLE = {
  svelte: "web/svelte/basic/src/App.svelte",
  vue: "web/vue/basic/src/App.vue",
  module: "web/svelte/basic/src/main.ts",
};

/** What differs for a `.svelte` component, and how. */
const SVELTE_EXCEPTIONS = {
  "prettier/prettier": 0,
  "prefer-const": 0,
  "svelte/prefer-const": 2,
  "@typescript-eslint/no-meaningless-void-operator": 0,
  "sonarjs/void-use": 0,
  "import-x/no-self-import": 0,
};

test("a component's script gets the TypeScript blocks", async () => {
  // One rule from each carried block: prettier's, unicorn's, sonarjs's and
  // the TypeScript tuning.
  const carried = [
    "curly",
    "unicorn/catch-error-name",
    "sonarjs/no-try-promise",
    "@typescript-eslint/no-unused-vars",
  ];
  const module = await severities(EXAMPLE.module, carried);

  for (const file of [EXAMPLE.svelte, EXAMPLE.vue]) {
    const component = await severities(file, carried);

    for (const rule of carried) {
      assert.ok(module[rule] > 0, `${rule} is not on for ${EXAMPLE.module}`);
      assert.equal(component[rule], module[rule], `${rule} for ${file}`);
    }
  }
});

test("the svelte exceptions reach a svelte component and nothing else", async () => {
  const rules = Object.keys(SVELTE_EXCEPTIONS);

  assert.deepEqual(await severities(EXAMPLE.svelte, rules), SVELTE_EXCEPTIONS);

  const vue = await severities(EXAMPLE.vue, rules);

  assert.equal(vue["svelte/prefer-const"], undefined);

  for (const rule of rules.filter((r) => r !== "svelte/prefer-const")) {
    assert.equal(vue[rule], 2, rule);
  }
});

test("a rule the examples block relaxes for `.ts` is relaxed for their components", async () => {
  const relaxed = [
    "@typescript-eslint/no-misused-promises",
    "unicorn/name-replacements",
    "@typescript-eslint/no-unsafe-assignment",
  ];
  const expected = await severities(EXAMPLE.module, relaxed);

  for (const rule of relaxed) {
    assert.equal(
      expected[rule],
      0,
      `${rule} is not relaxed for ${EXAMPLE.module}`,
    );
  }

  for (const file of [EXAMPLE.svelte, EXAMPLE.vue]) {
    assert.deepEqual(await severities(file, relaxed), expected, file);
  }
});

test("⚠ one `extraFileExtensions` for every file the project service parses", async () => {
  // A different value between two files reloads every project: set on
  // components alone, a run mixing them with `.ts` files is many times slower.
  for (const file of Object.values(EXAMPLE)) {
    assert.deepEqual(
      (await configOf(file)).languageOptions.parserOptions?.extraFileExtensions,
      [".svelte", ".vue"],
      file,
    );
  }
});

test("⚠ a component parser gets the parser module, which svelte-eslint-parser recognises without a test parse", async () => {
  for (const file of [EXAMPLE.svelte, EXAMPLE.vue]) {
    const { parser } = (await configOf(file)).languageOptions.parserOptions;

    for (const member of [
      "parseForESLint",
      "parse",
      "createProgram",
      "clearCaches",
    ]) {
      assert.equal(typeof parser[member], "function", `${member} for ${file}`);
    }

    assert.equal(typeof parser.version, "string", file);
  }
});

test("⚠ import-x/no-duplicates is off for a svelte file", async () => {
  // Every `svelte/*` subpath resolves to one declaration file, so the rule's
  // fix merges `svelte/transition` and `svelte/easing` into an import that
  // does not exist.
  assert.deepEqual(
    await severities(EXAMPLE.svelte, ["import-x/no-duplicates"]),
    { "import-x/no-duplicates": 0 },
  );

  assert.equal(
    (await severities(EXAMPLE.module, ["import-x/no-duplicates"]))[
      "import-x/no-duplicates"
    ] > 0,
    true,
  );
});
