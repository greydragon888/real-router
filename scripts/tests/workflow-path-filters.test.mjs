// Every path filter in a workflow names something that exists (#2537).
//
// A `paths:` entry whose directory is renamed stops matching without a word:
// the workflow simply stops running on the pull requests it was written for,
// and nothing reports the job that never started. `wiki-checkers.yml` names the
// raiser-head fixture that way, and every other filter here has the same
// failure, so this reads all of them: the literal part of each pattern, up to
// its first glob character, must exist in the tree.
//
// The workflows are read by the `yaml` parser, closed (`scripts/closed-yaml.mjs`),
// so a filter key in quotes or a flow list reads as GitHub reads it. A filter
// whose value is not a list of strings is refused rather than skipped, so a
// filter this cannot read is never counted as one that passed.

import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { isMap, isScalar, isSeq } from "yaml";

import { readClosedYaml } from "../closed-yaml.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const WORKFLOWS = join(ROOT, ".github/workflows");

/**
 * Every `paths:` / `paths-ignore:` filter of a workflow's triggers, with the
 * entries it lists; a value that is not a list of strings lists none.
 */
function pathFilterKeys(text) {
  const on = readClosedYaml(text).get("on", true);
  const keys = [];

  // `on: push` and `on: [push, pull_request]` carry no filter.
  if (!isMap(on)) return keys;

  for (const { key: event, value } of on.items) {
    if (!isMap(value)) continue;

    for (const key of ["paths", "paths-ignore"]) {
      const node = value.get(key, true);

      if (node === undefined) continue;

      const read =
        isSeq(node) &&
        node.items.every(
          (item) => isScalar(item) && typeof item.value === "string",
        );

      keys.push({
        where: `on.${event.value}.${key}`,
        key,
        entries: read ? node.items.map((item) => item.value) : [],
      });
    }
  }

  return keys;
}

/** The literal part of a pattern, up to its first glob character. */
const literalPrefix = (pattern) =>
  pattern.replace(/^!/u, "").split(/[*?[{]/u)[0];

/** The entries of `keys` whose literal part is missing under `root`. */
const staleEntries = (keys, root) =>
  keys.flatMap(({ entries }) =>
    entries.filter((pattern) => {
      const prefix = literalPrefix(pattern);

      // `**/*.md` has no literal part: it names every directory, so nothing
      // can move out from under it.
      return prefix !== "" && !existsSync(join(root, prefix));
    }),
  );

test("every workflow path filter names something that exists", () => {
  const stale = [];
  const unread = [];
  const read = [];

  for (const file of readdirSync(WORKFLOWS).filter((name) =>
    /\.ya?ml$/u.test(name),
  )) {
    const keys = pathFilterKeys(readFileSync(join(WORKFLOWS, file), "utf8"));

    for (const { where, entries } of keys) {
      (entries.length === 0 ? unread : read).push(`${file} ${where}`);
    }

    for (const pattern of staleEntries(keys, ROOT)) {
      stale.push(`${file}  ${pattern}`);
    }
  }

  assert.deepEqual(unread, [], "a filter key this test cannot read");
  assert.deepEqual(stale, []);
  // The walk reaches the filters: the one the header names is among them.
  assert.ok(
    read.includes("wiki-checkers.yml on.pull_request.paths"),
    read.join("\n"),
  );
});

test("CONTROL — a moved directory is stale, a glob-only pattern is not, a quoted key and a flow list are read, a scalar is refused", () => {
  const keys = pathFilterKeys(
    [
      "on:",
      "  pull_request:",
      "    paths:",
      '      - "packages/core/tests/fixtures/no-such-directory/**"',
      "      # a comment between entries is skipped",
      '      - "packages/*/src/**"',
      "    paths-ignore:",
      '      - "**/*.md"',
      "  push:",
      '    "paths": ["scripts/**"]',
      "  pull_request_target:",
      '    paths: "scripts/**"',
      "jobs: {}",
    ].join("\n"),
  );

  assert.deepEqual(
    keys.map(({ where, entries }) => [where, entries]),
    [
      [
        "on.pull_request.paths",
        [
          "packages/core/tests/fixtures/no-such-directory/**",
          "packages/*/src/**",
        ],
      ],
      ["on.pull_request.paths-ignore", ["**/*.md"]],
      ["on.push.paths", ["scripts/**"]],
      ["on.pull_request_target.paths", []],
    ],
  );
  assert.deepEqual(staleEntries(keys, ROOT), [
    "packages/core/tests/fixtures/no-such-directory/**",
  ]);
});
