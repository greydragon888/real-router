// The svelte package lints a component's script with the root's rules for
// `**/*.ts`, and its config names five rules that differ for a component
// (#2407). A lint run cannot hold this: a rule dropped from, or an exception
// widened to, a file kind with nothing to report leaves the run green. So each
// cell asks ESLint which rules reach a file of each kind.
//
// Runs in the repo-lints CI job via `node --test scripts/*.test.mjs`.

import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { ESLint } from "eslint";

const PACKAGE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "packages",
  "svelte",
);
const eslint = new ESLint({ cwd: PACKAGE });

/** A rule's severity for a file: 0 off, 1 warn, 2 error, undefined absent. */
async function severities(file, rules) {
  const config = await eslint.calculateConfigForFile(file);

  assert.ok(config, `${file} has no config`);

  return Object.fromEntries(
    rules.map((rule) => [rule, config.rules[rule]?.[0]]),
  );
}

const COMPONENT = "src/components/Link.svelte";
const MODULE = "src/index.ts";
const RUNES = "src/createRouteContext.svelte.ts";

/** What differs for a component, and how. */
const EXCEPTIONS = {
  "prettier/prettier": 0,
  "prefer-const": 0,
  "svelte/prefer-const": 2,
  "@typescript-eslint/no-meaningless-void-operator": 0,
  "sonarjs/void-use": 0,
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
  const component = await severities(COMPONENT, carried);
  const module = await severities(MODULE, carried);

  for (const rule of carried) {
    assert.ok(module[rule] > 0, `${rule} is not on for ${MODULE}`);
    assert.equal(component[rule], module[rule], rule);
  }
});

test("the exceptions reach a component and nothing else", async () => {
  const rules = Object.keys(EXCEPTIONS);
  const component = await severities(COMPONENT, rules);

  assert.deepEqual(component, EXCEPTIONS);

  for (const file of [MODULE, RUNES]) {
    const other = await severities(file, rules);

    assert.equal(other["svelte/prefer-const"], undefined, file);

    for (const rule of rules.filter((r) => r !== "svelte/prefer-const")) {
      assert.equal(other[rule], 2, `${rule} for ${file}`);
    }
  }
});
