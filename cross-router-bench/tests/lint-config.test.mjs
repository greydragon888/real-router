// What `eslint.config.mjs` here reaches, asked of ESLint file by file. A lint
// run cannot hold this: a file a global `ignores` hides, or a rule dropped from
// a file kind with nothing to report, leaves the run green.
//
// The root's `lint:reach` reads the packages of the root workspace only, and
// this one is a workspace of its own; its config imports what only this
// workspace installs. So the census and the component cells run here:
// `pnpm test:lint-config`, which `pnpm lint:cross-router` at the root runs
// after the lint.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { ESLint } from "eslint";

const HERE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const eslint = new ESLint({ cwd: HERE });

const CODE = /\.(?:[cm]?[jt]sx?|svelte)$/;

/** Deck templates the build fills in: not JavaScript until it has. */
const DELIBERATE = new Set(["deck/deck-config.js", "deck/deck-render.js"]);

/** The repository's policy, copied with the root config: no `.mjs` is linted. */
const policy = (file) => file.endsWith(".mjs");

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

const APP = {
  component: "apps/svelte/real-router/src/App.svelte",
  module: "apps/svelte/real-router/src/main.ts",
  cycle: "apps/svelte/sv-router/src/App.svelte",
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

test("every tracked code file is linted, but for the policy and the deck templates", async () => {
  const files = execFileSync("git", ["ls-files"], {
    cwd: HERE,
    encoding: "utf8",
  })
    .split("\n")
    .filter((file) => CODE.test(file));
  const linted = [];
  const ignored = [];

  for (const file of files) {
    if (await eslint.isPathIgnored(path.join(HERE, file))) {
      ignored.push(file);
    } else {
      await configOf(file);
      linted.push(file);
    }
  }

  assert.ok(
    linted.some((file) => file.startsWith("apps/")),
    "the census reached no app — it would pass over nothing",
  );
  assert.deepEqual(
    ignored.filter((file) => !policy(file) && !DELIBERATE.has(file)),
    [],
    "a code file is ignored that neither the policy nor DELIBERATE names",
  );
  assert.deepEqual(
    [...DELIBERATE].filter((file) => !ignored.includes(file)),
    [],
    "a DELIBERATE entry is linted now, or is gone — drop it",
  );
});

test("the svelte exceptions reach a svelte component and not its module", async () => {
  const rules = Object.keys(SVELTE_EXCEPTIONS);

  assert.deepEqual(await severities(APP.component, rules), SVELTE_EXCEPTIONS);

  const module = await severities(APP.module, rules);

  assert.equal(module["svelte/prefer-const"], undefined);

  for (const rule of rules.filter((r) => r !== "svelte/prefer-const")) {
    assert.equal(module[rule], 2, `${rule} for ${APP.module}`);
  }
});

test("a rule the apps' block relaxes for `.ts` is relaxed for their components", async () => {
  const relaxed = ["import-x/order", "prefer-template", "id-length"];
  const module = await severities(APP.module, relaxed);

  for (const rule of relaxed) {
    assert.equal(module[rule], 0, `${rule} is not relaxed for ${APP.module}`);
  }

  assert.deepEqual(await severities(APP.component, relaxed), module);
});

test("the sv-router cycle is exempt in its components alone", async () => {
  assert.deepEqual(await severities(APP.cycle, ["import-x/no-cycle"]), {
    "import-x/no-cycle": 0,
  });
  assert.ok(
    (await severities(APP.component, ["import-x/no-cycle"]))[
      "import-x/no-cycle"
    ] > 0,
  );
});

test("⚠ one `extraFileExtensions` for every file the project service parses", async () => {
  // A different value between two files reloads every project: set on
  // components alone, a run mixing them with `.ts` files is many times slower.
  for (const file of [APP.component, APP.module]) {
    assert.deepEqual(
      (await configOf(file)).languageOptions.parserOptions?.extraFileExtensions,
      [".svelte"],
      file,
    );
  }
});

test("⚠ a component parser gets the parser module, and import-x/no-duplicates is off for it", async () => {
  const { parser } = (await configOf(APP.component)).languageOptions
    .parserOptions;

  for (const member of [
    "parseForESLint",
    "parse",
    "createProgram",
    "clearCaches",
  ]) {
    assert.equal(typeof parser[member], "function", member);
  }

  assert.deepEqual(
    await severities(APP.component, ["import-x/no-duplicates"]),
    {
      "import-x/no-duplicates": 0,
    },
  );
  assert.ok(
    (await severities(APP.module, ["import-x/no-duplicates"]))[
      "import-x/no-duplicates"
    ] > 0,
  );
});
