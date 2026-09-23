// Every path filter in a workflow names something that exists (#2537).
//
// A `paths:` entry whose directory is renamed stops matching without a word:
// the workflow simply stops running on the pull requests it was written for,
// and nothing reports the job that never started. `wiki-checkers.yml` names the
// raiser-head fixture that way, and every other filter here has the same
// failure, so this reads all of them: the literal part of each pattern, up to
// its first glob character, must exist in the tree.
//
// Deliberately NOT a YAML library, like the other workflow tests here: one shape
// is read, a `paths:` or `paths-ignore:` key followed by a block list. A key
// written any other way is refused rather than skipped, so a filter this cannot
// read is never counted as one that passed.

import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const WORKFLOWS = join(ROOT, ".github/workflows");

/** Every `paths:` / `paths-ignore:` key in `text`, with the entries it lists. */
function pathFilterKeys(text) {
  const lines = text.split("\n");
  const keys = [];

  for (let at = 0; at < lines.length; at++) {
    const key = /^(\s*)(paths|paths-ignore):(.*)$/u.exec(lines[at]);

    if (key === null) continue;

    const entries = [];
    // A value on the key's own line is a flow list or a scalar, which this does
    // not read — the entries stay empty and the key is refused below.
    const inline = key[3].replace(/#.*$/u, "").trim();

    for (let next = at + 1; inline === "" && next < lines.length; next++) {
      const line = lines[next];

      if (line.trim() === "" || /^\s*#/u.test(line)) continue;
      if (line.length - line.trimStart().length <= key[1].length) break;

      const item = /^\s*-\s*["']?([^"'#]+?)["']?\s*(?:#.*)?$/u.exec(line);

      if (item === null) break;

      entries.push(item[1]);
    }

    keys.push({ line: at + 1, key: key[2], entries });
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

  for (const file of readdirSync(WORKFLOWS).filter((name) =>
    /\.ya?ml$/u.test(name),
  )) {
    const keys = pathFilterKeys(readFileSync(join(WORKFLOWS, file), "utf8"));

    for (const { line, key, entries } of keys) {
      if (entries.length === 0) unread.push(`${file}:${line} ${key}`);
    }

    for (const pattern of staleEntries(keys, ROOT)) {
      stale.push(`${file}  ${pattern}`);
    }
  }

  assert.deepEqual(unread, [], "a filter key this test cannot read");
  assert.deepEqual(stale, []);
});

test("CONTROL — a moved directory is stale, a glob-only pattern is not, a flow list is refused", () => {
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
      '    paths: ["scripts/**"]',
      "jobs:",
    ].join("\n"),
  );

  assert.deepEqual(
    keys.map(({ key, entries }) => [key, entries]),
    [
      [
        "paths",
        [
          "packages/core/tests/fixtures/no-such-directory/**",
          "packages/*/src/**",
        ],
      ],
      ["paths-ignore", ["**/*.md"]],
      ["paths", []],
    ],
  );
  assert.deepEqual(staleEntries(keys, ROOT), [
    "packages/core/tests/fixtures/no-such-directory/**",
  ]);
});
