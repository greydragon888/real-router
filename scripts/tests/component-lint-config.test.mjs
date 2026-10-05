// A component's script is linted by the root's rules for `**/*.ts`, and the
// root config names the rules that differ for a component (#2407, #2556). A
// lint run cannot hold this: a rule dropped from, or an exception widened to,
// a file kind with nothing to report leaves the run green. So each cell asks
// ESLint which rules reach a file of each kind, in each tree that lints one.
// The examples lint under a config of their own, which loads only where their
// workspace is installed: `examples/tests/component-lint-config.test.mjs` asks
// the same of it, in the weekly `examples.yml` lint job.
//
// `scripts/scripts-tests.mjs` runs it in pre-push and Repo Lints.

import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { ESLint } from "eslint";

const ROOT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);

// ESLint 10 looks the config up from each file, so one instance answers for
// the package and the benchmarks alike.
const eslint = new ESLint({ cwd: ROOT });

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

const PACKAGE = {
  component: "packages/svelte/src/components/Link.svelte",
  module: "packages/svelte/src/index.ts",
  runes: "packages/svelte/src/createRouteContext.svelte.ts",
};

const BENCH = {
  component: "benchmarks/adapter-bench/apps/svelte/App.svelte",
  module: "benchmarks/adapter-bench/apps/svelte/index.ts",
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

test("a component's script gets the root's TypeScript blocks", async () => {
  // One rule from each carried block: prettier's, unicorn's, sonarjs's and
  // the TypeScript tuning.
  const carried = [
    "curly",
    "unicorn/catch-error-name",
    "sonarjs/no-try-promise",
    "@typescript-eslint/no-unused-vars",
  ];
  const module = await severities(PACKAGE.module, carried);
  const component = await severities(PACKAGE.component, carried);

  for (const rule of carried) {
    assert.ok(module[rule] > 0, `${rule} is not on for ${PACKAGE.module}`);
    assert.equal(component[rule], module[rule], rule);
  }
});

test("the svelte exceptions reach a svelte component and nothing else", async () => {
  const rules = Object.keys(SVELTE_EXCEPTIONS);

  for (const file of [PACKAGE.component, BENCH.component]) {
    assert.deepEqual(await severities(file, rules), SVELTE_EXCEPTIONS, file);
  }

  for (const file of [PACKAGE.module, PACKAGE.runes]) {
    const other = await severities(file, rules);

    assert.equal(other["svelte/prefer-const"], undefined, file);

    for (const rule of rules.filter((r) => r !== "svelte/prefer-const")) {
      assert.equal(other[rule], 2, `${rule} for ${file}`);
    }
  }
});

test("a rule a path block relaxes for `.ts` is relaxed for that path's components", async () => {
  // The benchmark apps' block.
  const bench = ["import-x/order", "prefer-template", "id-length"];
  const expected = await severities(BENCH.module, bench);

  for (const rule of bench) {
    assert.equal(
      expected[rule],
      0,
      `${rule} is not relaxed for ${BENCH.module}`,
    );
  }

  assert.deepEqual(await severities(BENCH.component, bench), expected);

  // A relaxation stays on its path: the package's component keeps the rules.
  const strict = await severities(PACKAGE.component, bench);

  for (const [rule, severity] of Object.entries(strict)) {
    assert.ok(severity > 0, `${rule} is off for ${PACKAGE.component}`);
  }
});

test("⚠ one `extraFileExtensions` for every file the project service parses", async () => {
  // A different value between two files reloads every project: set on
  // components alone, a run mixing them with `.ts` files is many times slower.
  const files = [...Object.values(PACKAGE), ...Object.values(BENCH)];
  const values = await Promise.all(
    files.map(
      async (file) =>
        (await configOf(file)).languageOptions.parserOptions
          ?.extraFileExtensions,
    ),
  );

  for (const [index, value] of values.entries()) {
    assert.deepEqual(value, [".svelte"], files[index]);
  }
});

test("⚠ a component parser gets the parser module, which svelte-eslint-parser recognises without a test parse", async () => {
  // Handed a smaller object, svelte-eslint-parser parses an empty file with no
  // `tsconfigRootDir` to tell. Under `benchmarks/` that parse fails, and the
  // component is read as JavaScript, without the rune types.
  for (const file of [PACKAGE.component, BENCH.component]) {
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
  for (const file of [PACKAGE.component, PACKAGE.runes, BENCH.component]) {
    assert.deepEqual(
      await severities(file, ["import-x/no-duplicates"]),
      { "import-x/no-duplicates": 0 },
      file,
    );
  }

  assert.equal(
    (await severities(PACKAGE.module, ["import-x/no-duplicates"]))[
      "import-x/no-duplicates"
    ] > 0,
    true,
  );
});
