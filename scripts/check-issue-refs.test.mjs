// check-issue-refs.test.mjs — the extraction half of the issue-reference guard,
// pinned on planted fixtures.
//
// Run:  node --test scripts/check-issue-refs.test.mjs
//
// ⚑ Only the OFFLINE half is testable here, and that is the whole design: the
// guard's other half asks GitHub for each number's state, and a test that did
// the same would be neither deterministic nor runnable on a plane. What CAN be
// pinned is which strings count as a citation — and every cell below is a
// distinction the first draft of the pattern got wrong.
//
// Stdlib node:test/node:assert only (Node 24) — scripts/ is not a vitest
// workspace; the repo-lints `node --test scripts/*.test.mjs` step picks this
// file up by glob.

import assert from "node:assert/strict";
import { test } from "node:test";

import { commentsOf, refsIn } from "./check-issue-refs.mjs";

test("a citation in a line comment is found", () => {
  assert.deepEqual([...refsIn("// see #1976 for why\nconst a = 1;")], [1976]);
});

test("a citation in a block comment is found", () => {
  assert.deepEqual([...refsIn("/** attached at construction (#1976) */")], [1976]);
});

test("a number inside a STRING is not a citation", () => {
  // The defect this pins: a scan over raw source counts `"#1976"` as prose.
  assert.deepEqual([...refsIn('const label = "#1976";')], []);
  assert.deepEqual([...refsIn("const label = '#1976';")], []);
  assert.deepEqual([...refsIn("const label = `#1976`;")], []);
});

test("a CSS colour is not a citation", () => {
  // `#1976d2` would yield 1976 without the trailing word boundary.
  assert.deepEqual([...refsIn("// brand colour #1976d2 stays put")], []);
});

test("a fragment path is not a citation", () => {
  // The lookbehind is what rejects this; `\b` alone would admit it.
  assert.deepEqual([...refsIn("// see docs/routing.md#12 for the table")], []);
});

test("a one-digit number is not a citation, a two-digit one is", () => {
  // #12 is a real issue in this repository, so two digits is the floor.
  assert.deepEqual([...refsIn("// bug #7 was different")], []);
  assert.deepEqual([...refsIn("// bug #12 was this one")], [12]);
});

test("several citations in one comment all count, and repeats collapse", () => {
  assert.deepEqual(
    [...refsIn("// #1976 supersedes #1975, and #1976 again")].sort((a, b) => a - b),
    [1975, 1976],
  );
});

test("a trailing comment on a code line counts", () => {
  assert.deepEqual([...refsIn("const a = 1; // frozen since #1606")], [1606]);
});

test("CONTROL — the extractor sees comments, and only comments", () => {
  const source = [
    'const inString = "#1111";',
    "// #2222 in a line comment",
    "/* #3333 in a block comment */",
    "const after = 4444;",
  ].join("\n");

  assert.deepEqual([...refsIn(source)].sort((a, b) => a - b), [2222, 3333]);
  assert.equal(commentsOf(source).length, 2);
});
