// A guard must CHECK what it ASSERTS (#1838).
//
// `isStateStrict` declared `value is State<P>` while validating three members —
// `name`, `path`, `params` — of the six `State` declares (`search`, `transition`
// and `context` are the other three). It is the shape
// `packages/core/tests/functional/type-mirror-authority.test.ts` exists to
// catch, one package over, and it was not hypothetical: `popstate-utils` reads
// `state.search` on the line after the guard passes and hands it to
// `api.makeState`.
//
// Measured end to end before the fix, through `makeState`:
//
//   search: {}                 → state.search keys []          ← correct
//   search: "NOT-AN-OBJECT"    → state.search keys ["0".."12"] ← one per character
//   search: ["x", "y"]         → state.search keys ["0","1"]
//
// So a hand-crafted or corrupted `history.state` survived the guard and committed
// a state whose query channel was character-indexed garbage, with `state.path`
// unchanged — nothing downstream complained.
//
// ⚠ `search` may legitimately be ABSENT: entries written before RFC-4 M2 (#1548)
// have no query channel, and `popstate-utils` documents that `makeState` reuses
// the frozen empty bag for them. So the rule is "absent is fine, present must be
// an object", and the ASSERTION is narrowed to match — `isStateStrict` promises
// a restorable entry, not a full `State`.

import { describe, expect, it } from "vitest";

import { isStateStrict } from "../../../src/browser-env/state-guard";

const base = { name: "a", path: "/a", params: {} };

describe("isStateStrict checks what it asserts (#1838)", () => {
  it.each([
    ["a full State", { ...base, search: {}, transition: {}, context: {} }],
    ["no search at all (pre-M2 entry)", base],
    ["an explicit undefined search", { ...base, search: undefined }],
  ])("accepts %s", (_label, value) => {
    expect(isStateStrict(value)).toBe(true);
  });

  it.each([
    ["a string search", { ...base, search: "NOT-AN-OBJECT" }],
    ["a numeric search", { ...base, search: 42 }],
    ["an array search", { ...base, search: ["x", "y"] }],
    ["a string transition", { ...base, transition: "x" }],
    ["a null context", { ...base, context: null }],
  ])("rejects %s", (_label, value) => {
    expect(isStateStrict(value)).toBe(false);
  });

  it("CONTROL — the required members are still required", () => {
    // Without this, `return false` would pass every rejection cell above.
    expect(isStateStrict({ path: "/a", params: {} })).toBe(false);
    expect(isStateStrict({ name: "a", params: {} })).toBe(false);
    expect(isStateStrict({ name: "a", path: "/a" })).toBe(false);
  });
});
