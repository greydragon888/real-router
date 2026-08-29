// #1829 — `hasField` / `getField` answer about the error's OWN fields, and
// nothing else.
//
// Both walked the prototype chain (`key in this`, `this[key]`), so an error with
// ONE custom field answered `true` for eighteen names and handed back native
// methods for most of them. `toString` and `constructor` are ordinary strings —
// they arrive from a config key, a route param name, a serialized payload.
//
// ⚑ The whole surface is external: `RouterError` is a root export and neither
// method has a call site in any `src/` in the monorepo, so nothing in-repo was
// WRONG. That is what makes it a contract defect rather than a latent one.
//
// ⚠ It does not follow that nothing in-repo covered them, and an earlier
// revision of this line said "no call site inside the monorepo" — measured,
// there are ~20, all in TESTS, including a whole property file. What that file
// could not do is reach the defect: its "non-existent field" generator builds
// `__non_existent_${randomKey}__`, prefixed AND suffixed, so no `fc.string()`
// ever produces `toString`. 10 000 runs, zero coverage of this axis. The
// reachable half now lives beside it (`methods.properties.ts`).
//
// ⚠ **The fix is NOT the one the issue proposes.** It suggested reusing
// `toJSON`'s `excludeKeys`, on the ground that the two would otherwise disagree
// about one instance. Measured against the methods' own docstrings, that set
// keeps 1 of 4 documented promises:
//
//     rule                        segment/path/code/userId   false positives
//     `key in this` (before)      1111                       18
//     `Object.hasOwn`             1111                        0
//     hasOwn minus toJSON's set   0001                        0   <- the proposal
//
// `hasField("segment") // true` and `getField("code") // "ERR" (built-in field)`
// are worked examples in the JSDoc above each method. The two functions answer
// DIFFERENT questions — `toJSON` says what to serialize, these say what the
// error carries — so agreeing on `code` / `segment` / `path` (they do) is the
// contract, and diverging on `message` / `stack` / `name` is not drift.
import { describe, expect, it } from "vitest";

import { RouterError } from "@real-router/core";

/**
 * Derived at runtime, never written out: a hand-written enumeration of
 * `Object.prototype`'s members is what the sibling sweep #1798 got wrong, and
 * the set grows with the engine.
 */
const INHERITED = Object.getOwnPropertyNames(Object.prototype);

/** The class's own methods, read off the prototype rather than listed. */
const METHODS = Object.getOwnPropertyNames(
  Object.getPrototypeOf(new RouterError("SOME_CODE")) as object,
).filter((name) => name !== "constructor");

interface FieldAccess {
  hasField: (key: string) => boolean;
  getField: (key: string) => unknown;
}

function makeError(): FieldAccess {
  return new RouterError("ROUTE_NOT_FOUND", {
    segment: "users",
    path: "/users",
    userId: "u1",
  });
}

describe("#1829 — field access is own-only", () => {
  it("COUNTS what the old rule got wrong, so the prose cannot drift from it", () => {
    // ⚠ This cell exists because the number DID drift: the changeset, the commit
    // message, this file's header and `RouterError.ts`'s comment all said
    // "twenty", derived from "twelve inherited + six methods" — which is
    // eighteen. `constructor` is on BOTH lists and counts once. Nothing was
    // wrong with the fix; the arithmetic was invented and repeated four times,
    // which is what an uncounted number in prose does.
    const err = makeError();
    const own = new Set(Object.getOwnPropertyNames(err));
    const falsePositives = [...new Set([...INHERITED, ...METHODS])].filter(
      (name) => !own.has(name),
    );

    expect(INHERITED).toHaveLength(12);
    expect(METHODS).toHaveLength(6);
    expect(falsePositives).toHaveLength(18);

    // ...and every one of them answers correctly NOW. Without this line the
    // count above is trivia; with it, the count is the size of what was closed.
    expect(falsePositives.filter((name) => err.hasField(name))).toStrictEqual(
      [],
    );
  });

  it("answers false / undefined for every INHERITED name", () => {
    const err = makeError();

    // Before: twelve of twelve, and `getField` returned the native function.
    expect(INHERITED.filter((name) => err.hasField(name))).toStrictEqual([]);
    expect(
      INHERITED.filter((name) => err.getField(name) !== undefined),
    ).toStrictEqual([]);
  });

  it("answers false / undefined for the class's OWN METHOD names", () => {
    const err = makeError();

    // Derived, so a seventh method added later is covered without an edit.
    expect(METHODS.length).toBeGreaterThan(3);
    expect(METHODS.filter((name) => err.hasField(name))).toStrictEqual([]);
    expect(
      METHODS.filter((name) => err.getField(name) !== undefined),
    ).toStrictEqual([]);
  });

  it("POSITIVE CONTROL — still answers for every field the docstrings promise", () => {
    // Without this column the cell above passes by refusing everything, which is
    // exactly what the issue's proposed fix would have done to three of these.
    const err = makeError();

    expect({
      userId: err.hasField("userId"),
      segment: err.hasField("segment"),
      path: err.hasField("path"),
      code: err.hasField("code"),
    }).toStrictEqual({
      userId: true,
      segment: true,
      path: true,
      code: true,
    });

    expect(err.getField("userId")).toBe("u1");
    expect(err.getField("code")).toBe("ROUTE_NOT_FOUND");
    expect(err.getField("segment")).toBe("users");
  });

  it("NEGATIVE CONTROL — a name the error does not carry is still false", () => {
    const err = makeError();

    expect(err.hasField("unknown")).toBe(false);
    expect(err.getField("unknown")).toBeUndefined();
  });

  it("`getField` is not a back door around `hasField`", () => {
    // The two are reachable independently — a consumer may call `getField`
    // without asking first — so the read needed the change as much as the
    // predicate did.
    const err = makeError();

    for (const name of [...INHERITED, ...METHODS]) {
      expect(err.getField(name), `getField(${name})`).toBeUndefined();
    }
  });
});
