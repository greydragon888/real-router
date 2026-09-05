// #1837 finding 2 — the guard reads a third party's object, so every read is a
// call into code the plugin does not own.
//
// `isParams` has wrapped its walk in a try/catch since #1052 for exactly this
// reason. The guard's OWN reads had no boundary: `obj.name`, `obj.path`,
// `obj.search`, `obj.transition`, `obj.context` are plain property accesses on
// a `history.state` payload, and a payload can carry accessors — an entry
// written by another script, or a `get`-trapping Proxy.
//
// ⚠ The issue framed this as "two of the three reads", on the ground that
// `isParams` covers `params`. Measured: it does not, and cannot. The getter
// fires on the property READ, in `isRequiredFields`, BEFORE `isParams` is
// entered — so `params` escaped exactly like `name` and `path`. All five reads
// needed the boundary, not two.
//
// What it costs when it escapes: `onPopState` has a try, so the throw is
// contained — but it is classified as `[browser-plugin] Critical error in
// onPopState` instead of the correct "this entry is not restorable → fall back
// to `matchPath`". A wrong classification, not a crash.
import { describe, expect, it } from "vitest";

import { isStateStrict } from "../../../src/browser-env/state-guard";

const BOOM = new Error("from the entry's accessor");

/** A `history.state` payload whose named member throws when read. */
function throwingAt(member: string): Record<string, unknown> {
  const base: Record<string, unknown> = {
    name: "users.list",
    params: {},
    path: "/users/list",
  };

  return Object.defineProperty(base, member, {
    get(): never {
      throw BOOM;
    },
    enumerable: true,
    configurable: true,
  });
}

describe("#1837 — a throwing accessor on the entry is REFUSED, not rethrown", () => {
  it("survives a throwing getter on every member the guard reads", () => {
    // ⚑ ONE assertion over all five, so a member dropped from the list cannot
    // pass by not being tested. `verdict` is `false` — an entry the guard
    // cannot read is not restorable, which is the same answer it gives any
    // other malformed payload.
    const verdicts = ["name", "path", "params", "search", "transition"].map(
      (member) => {
        try {
          return [member, isStateStrict(throwingAt(member))];
        } catch (error) {
          return [member, `RETHREW: ${(error as Error).message}`];
        }
      },
    );

    expect(verdicts).toStrictEqual([
      ["name", false],
      ["path", false],
      ["params", false],
      ["search", false],
      ["transition", false],
    ]);
  });

  it("survives a get-trapping Proxy over an otherwise valid entry", () => {
    // The shape a reactive store or an instrumented page produces. Distinct
    // from the accessor above: the trap fires for EVERY key, including ones the
    // guard reaches only after the earlier ones passed.
    const trapped = new Proxy(
      { name: "users.list", params: {}, path: "/users/list" },
      {
        get(): never {
          throw BOOM;
        },
      },
    );

    expect(() => isStateStrict(trapped)).not.toThrow();
    expect(isStateStrict(trapped)).toBe(false);
  });

  it("survives a throwing getter INSIDE the params bag — the #1052 boundary", () => {
    // The read is one level deeper than the cells above: `params.id`, a value
    // INSIDE the bag, reached by `isParams`'s walk rather than by the guard's
    // own five property reads.
    //
    // ⚠ This cell does NOT pin `isParams`'s own `catch` (the #1052 boundary),
    // and the honest reason is worth more than the pretence. Measured twice:
    // making that `catch` rethrow left the whole suite GREEN before this file
    // existed, and leaves it green WITH this cell — because the outer
    // boundary added for #1837 subsumes it. Through `isStateStrict` the inner
    // one is now unobservable BY CONSTRUCTION, so no test reachable from here
    // can hold it.
    //
    // It stays where it is regardless: `isParams` is a byte-identical twin of
    // validation-plugin's copy, which has no outer boundary of its own, and
    // that copy is where the #1052 catch is still load-bearing.
    //
    // What this cell does pin is the OUTCOME — a nested throwing accessor is
    // refused rather than rethrown — which is the property a consumer depends
    // on and which survives whichever of the two boundaries catches it.
    const bag: Record<string, unknown> = {};

    Object.defineProperty(bag, "id", {
      get(): never {
        throw BOOM;
      },
      enumerable: true,
      configurable: true,
    });

    // The accessor is genuinely live — without this the cell is vacuous.
    expect(() => bag.id).toThrow(BOOM);

    expect(() =>
      isStateStrict({ name: "users.view", params: bag, path: "/users/1" }),
    ).not.toThrow();
    expect(
      isStateStrict({ name: "users.view", params: bag, path: "/users/1" }),
    ).toBe(false);

    // ...and the same one level down again, in `search`, which reaches the same
    // validator since this issue's first commit.
    expect(
      isStateStrict({
        name: "users.view",
        params: {},
        path: "/users/1",
        search: bag,
      }),
    ).toBe(false);
  });

  it("CONTROL — a valid entry is still ACCEPTED, and a plain invalid one still refused", () => {
    // Without this the cells above pass by refusing everything, which is what a
    // `try { … } catch { return false }` around the whole body would do if it
    // also swallowed the real verdict.
    expect(
      isStateStrict({ name: "users.list", params: {}, path: "/users/list" }),
    ).toBe(true);
    expect(
      isStateStrict({
        name: "users.list",
        params: {},
        path: "/users/list",
        search: { tab: "a" },
      }),
    ).toBe(true);
    expect(
      isStateStrict({ name: "users.list", params: "bad", path: "/u" }),
    ).toBe(false);
    expect(isStateStrict(null)).toBe(false);
  });

  it("CONTROL — the accessor is genuinely reached, not skipped by an earlier refusal", () => {
    // ⚠ The cell that stops the first one from being vacuous. A guard that
    // refused `throwingAt("transition")` for some unrelated reason would look
    // identical. Reading the member by hand must throw — i.e. the payload the
    // guard was handed really does have a live accessor on it.
    for (const member of ["name", "path", "params", "search", "transition"]) {
      const entry = throwingAt(member);

      expect(() => entry[member]).toThrow(BOOM);
    }
  });
});
