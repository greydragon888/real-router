// Mutation guard for the design-doc anchor checker.
//
// A green guard that guards nothing is the failure mode this repo has hit
// before, so every check in `check-doc-anchors.mjs` gets a falsifying input
// here — a document that MUST red — plus a positive control that must stay
// green. If a future edit makes a check inert, the matching case flips.
//
// Runs in the repo-lints CI job via `node --test scripts/*.test.mjs`.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test, before, after } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE_DIR = join(ROOT, "tmp-anchor-fixture");
const TARGET = join(FIXTURE_DIR, "zzAnchorFixtureTarget.ts");
const DOC = join(FIXTURE_DIR, "doc.md");

// 5 lines, line 3 blank, line 5 a bare closer.
const TARGET_SRC = [
  "export const a = 1;",
  "const b = 2;",
  "",
  "if (b) {",
  "}",
].join("\n");

before(() => {
  mkdirSync(FIXTURE_DIR, { recursive: true });
  writeFileSync(TARGET, TARGET_SRC);
});

after(() => rmSync(FIXTURE_DIR, { recursive: true, force: true }));

/**
 * ⚠ `spawnSync`, not `execFileSync`: every diagnostic this script writes —
 * warnings included — goes to stderr, and `execFileSync` hands back stdout
 * only. Asserting on its return value would make the two warning cases pass
 * against an empty string, i.e. a green test for a check that never ran.
 *
 * @returns {{code: number, out: string}}
 */
function run(markdown) {
  writeFileSync(DOC, markdown);
  const r = spawnSync(
    process.execPath,
    [join(ROOT, "scripts", "check-doc-anchors.mjs"), DOC],
    { cwd: ROOT, encoding: "utf8" },
  );
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

test("positive control: a resolvable anchor passes", () => {
  const { code } = run("Text `zzAnchorFixtureTarget.ts:2` more.");
  assert.equal(code, 0);
});

test("a name that matches no file is an error", () => {
  const { code, out } = run("Text `zzNoSuchFixture.ts:2`.");
  assert.equal(code, 1);
  assert.match(out, /no such file/);
});

test("a line past the end of the file is an error", () => {
  const { code, out } = run("Text `zzAnchorFixtureTarget.ts:99`.");
  assert.equal(code, 1);
  assert.match(out, /points past the end/);
});

test("an inverted range is an error", () => {
  const { code, out } = run("Text `zzAnchorFixtureTarget.ts:4-2`.");
  assert.equal(code, 1);
  assert.match(out, /inverted range/);
});

test("an ambiguous basename is an error", () => {
  const { code, out } = run("Text `helpers.ts:1`.");
  assert.equal(code, 1);
  assert.match(out, /ambiguous/);
});

test("a doc root resolves an otherwise ambiguous basename", () => {
  const { code } = run(
    "<!-- anchors-root: packages/core/src -->\n\nText `helpers.ts:1`.",
  );
  assert.equal(code, 0);
});

test("a bare :NNN inherits the file named in the same paragraph", () => {
  const { code } = run("See `zzAnchorFixtureTarget.ts:1` and `:2`.");
  assert.equal(code, 0);
});

test("a bare :NNN does NOT inherit across a blank line", () => {
  const { code, out } = run("See `zzAnchorFixtureTarget.ts:1`.\n\nAnd `:2`.");
  assert.equal(code, 1);
  assert.match(out, /no preceding file to attach to/);
});

test("an anchor landing on a blank line warns but does not fail", () => {
  const { code, out } = run("Text `zzAnchorFixtureTarget.ts:3`.");
  assert.equal(code, 0);
  assert.match(out, /BLANK line/);
});

test("an anchor landing on a bare closer warns but does not fail", () => {
  const { code, out } = run("Text `zzAnchorFixtureTarget.ts:5`.");
  assert.equal(code, 0);
  assert.match(out, /bare closer/);
});

test("anchors inside a fenced code block are ignored", () => {
  const { code } = run(
    ["```", "zzNoSuchFixture.ts:99", "  policy.keys(src)", "```"].join("\n"),
  );
  assert.equal(code, 0);
});
