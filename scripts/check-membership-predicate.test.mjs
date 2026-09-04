// The membership-predicate guard must actually discriminate (#2108).
//
// It reports a function that COUNTS a record's own keys with `Object.keys` and
// then tests MEMBERSHIP in that same record with a predicate drawing the own
// boundary somewhere else. Two instances shipped before it existed (#1815,
// #2064) and it found a third on its first run — `channelAgrees` in
// `shared/ssr`, which two hand-written scans had missed because they looked for
// `Object.hasOwn(` and the site spells the module-load capture `hasOwn(`.
//
// ⚠ Why a test at all: a scan with zero hits is indistinguishable from a broken
// one, and this scan's set is empty by design. Everything below is a planted
// site — the predicate is exercised on source STRINGS, so nothing writes to the
// tree.
//
// ⚠ The discriminator under test is the RECEIVER. A count of `a` beside a
// membership test on `b` is ordinary code and must NOT be reported; the same
// two halves aimed at one object must be, however far apart they sit.
//
// Runs in the repo-lints CI job via `node --test scripts/*.test.mjs`.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  OWN_PREDICATES,
  findSites,
  trackedSources,
} from "./check-membership-predicate.mjs";

const sites = (code) => findSites("probe.ts", code);

test("catches the #2064 shape — Object.keys count, hasOwnProperty membership", () => {
  const hits = sites(`
    function eq(prev, next) {
      const prevKeys = Object.keys(prev);
      if (prevKeys.length !== Object.keys(next).length) return false;
      for (const key of prevKeys) {
        if (!Object.prototype.hasOwnProperty.call(next, key)) return false;
      }
      return true;
    }
  `);

  assert.equal(hits.length, 1);
  assert.equal(hits[0].receiver, "next");
});

test("catches the #1815 shape — the membership test spelled `in`", () => {
  const hits = sites(`
    function eq(left, right) {
      if (Object.keys(left).length !== Object.keys(right).length) return false;
      return Object.keys(left).every((k) => k in right);
    }
  `);

  assert.equal(hits.length, 1);
  assert.equal(hits[0].receiver, "right");
});

test("catches the CAPTURED intrinsics this repo actually writes", () => {
  // The form two hand-written scans missed on `shared/ssr`: `objectKeys` and
  // `hasOwn` are module-load captures (#1971), not `Object.` members.
  const hits = sites(`
    function agrees(bag, committed) {
      const keys = objectKeys(committed);
      if (keys.length !== objectKeys(bag).length) return false;
      return keys.every((key) => hasOwn(bag, key));
    }
  `);

  assert.equal(hits.length, 1);
  assert.equal(hits[0].receiver, "bag");
});

test("catches the two halves when they are FAR apart in one function", () => {
  // Proximity was the rejected alternative, and this is why: a window wide
  // enough for this is wide enough to flag every unrelated pair.
  const filler = Array.from(
    { length: 40 },
    (_, i) => `  const x${i} = ${i};`,
  ).join("\n");
  const hits = sites(`
    function wide(bag) {
      const n = Object.keys(bag).length;
${filler}
      return n > 0 && Object.prototype.hasOwnProperty.call(bag, "id");
    }
  `);

  assert.equal(hits.length, 1);
});

test("catches `bag.hasOwnProperty(key)` — the unbound spelling", () => {
  const hits = sites(`
    function eq(a, b) {
      if (Object.keys(a).length !== Object.keys(b).length) return false;
      return b.hasOwnProperty("id");
    }
  `);

  assert.equal(hits.length, 1);
  assert.equal(hits[0].receiver, "b");
});

test("catches propertyIsEnumerable, which closes only half the class", () => {
  // Measured on #2064: it refuses the concealed key and believes a Proxy that
  // answers `enumerable: true`. So it is a member of the family, not a fix.
  const hits = sites(`
    function eq(a, b) {
      if (Object.keys(a).length !== Object.keys(b).length) return false;
      return Object.prototype.propertyIsEnumerable.call(b, "id");
    }
  `);

  assert.equal(hits.length, 1);
});

test("EVERY spelling in OWN_PREDICATES is caught — derived, not sampled", () => {
  // ⚠ The hand-written cells above SAMPLE the list, and sampling left three of
  // six unpinned: removing `hasOwnProperty.call`, `propertyIsEnumerable.call`
  // or `Object.hasOwn` kept the whole battery green.
  //
  // ⚠ And a loop over the LIVE list does not fix that — measured, on the first
  // attempt at this cell: a removed entry is simply not iterated, so removal
  // stays silent while addition is caught. The expectation has to be a LITERAL
  // set compared with `deepEqual`; the loop below then runs over the literal,
  // not over the thing under test.
  const EXPECTED = [
    "Object.prototype.hasOwnProperty.call",
    "Object.prototype.propertyIsEnumerable.call",
    "hasOwnProperty.call",
    "propertyIsEnumerable.call",
    "Object.hasOwn",
    "hasOwn",
  ];

  assert.deepEqual(
    [...OWN_PREDICATES],
    EXPECTED,
    "the predicate list changed — add or drop the spelling here too",
  );

  for (const predicate of EXPECTED) {
    const hits = sites(`
      function f(bag) {
        const n = Object.keys(bag).length;
        return n > 0 && ${predicate}(bag, "k");
      }
    `);

    assert.equal(hits.length, 1, `not caught: ${predicate}(bag, key)`);
    assert.equal(hits[0].receiver, "bag", `wrong receiver for ${predicate}`);
  }
});

test("CONTROL — a count and a membership test on DIFFERENT receivers are not a hit", () => {
  // Adjacent, same function, both halves present: only the receiver separates
  // this from the first cell. Without it the guard would flag ordinary code.
  const hits = sites(`
    function f(a, b) {
      const n = Object.keys(a).length;
      return n > 0 && Object.prototype.hasOwnProperty.call(b, "id");
    }
  `);

  assert.deepEqual(hits, []);
});

test("CONTROL — the FIXED form is not a hit", () => {
  // Membership in the list the count produced. Both instances now read this
  // way, and a guard that still flagged them would be unshippable.
  const hits = sites(`
    function eq(prev, next) {
      const prevKeys = Object.keys(prev);
      const nextKeys = Object.keys(next);
      if (prevKeys.length !== nextKeys.length) return false;
      return prevKeys.every((k) => nextKeys.includes(k));
    }
  `);

  assert.deepEqual(hits, []);
});

test("CONTROL — the two halves in DIFFERENT functions are two questions", () => {
  const hits = sites(`
    function count(bag) { return Object.keys(bag).length; }
    function has(bag) { return Object.prototype.hasOwnProperty.call(bag, "id"); }
  `);

  assert.deepEqual(hits, []);
});

test("the scan reaches shared/ — the half a package-rooted scan cannot", () => {
  // Not reasoned: `shared/` is where the third instance lived, and a scan that
  // could not see it would have reported the same clean tree as one that can.
  const files = trackedSources();

  assert.ok(
    files.some((f) => f.startsWith("shared/")),
    "no shared/ source in the scanned set",
  );
  assert.ok(
    files.some((f) => /^packages\/[^/]+\/src\//.test(f)),
    "no package src in the scanned set",
  );
  assert.ok(
    !files.some((f) => /\.(test|spec|properties)\./.test(f)),
    "tests must not be scanned — they plant these shapes on purpose",
  );
});
