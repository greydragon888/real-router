// #1837 finding 1 — `history.state` restores FOUR channels and validates the
// values of three.
//
// `history.state` is the one input in this codebase a third party genuinely
// controls: a previous page, another script, an entry written by an older
// version of the app. `popstate-utils` restores four channels from it —
// `name`, `params`, `search`, `path` — and hands them straight to
// `api.makeState`.
//
// ⚑ #1838 already closed the SHAPE half of this: `isOptionalBag` refuses a
// `search` that is a string or an array, because both reach `makeState` as a bag
// of numeric keys. What it does not do is look at the VALUES, and that is the
// half this file covers. Measured before the fix, every one of these was
// ACCEPTED into the frozen `state.search`:
//
//     {tab: () => 1}     {tab: Symbol()}   {tab: 10n}
//     {tab: <cyclic>}    {tab: new Date()} {tab: new Map()}
//
// while the SAME values in `params` were all refused. That asymmetry is the
// defect: two channels of one entry, opposite treatment, and `search` is the
// only one of the two that no value-level guard screens.
//
// ⚠ The consequence is not cosmetic, and it needs a browser that SERIALISES on
// write to see. jsdom's `history.replaceState` stores by identity, so the whole
// test estate is blind to it. Measured end to end with a structured-cloning
// mock: a function value gives `state.search.tab` of type `function`,
// `buildPath` prints `/users/list?tab=()%20%3D%3E%201`, and `structuredClone`
// of the committed state throws `DataCloneError` — which is what a real
// `history.pushState` does.
import { describe, expect, it } from "vitest";

import { isStateStrict } from "../../../src/browser-env/state-guard";

const BASE = { name: "users.list", params: {}, path: "/users/list" };

/** Built here rather than inline: a cycle cannot be written as a literal. */
function cyclicBag(): Record<string, unknown> {
  const cyclic: Record<string, unknown> = {};

  cyclic.self = cyclic;

  return { tab: cyclic };
}

describe("#1837 — the query channel is screened like the path channel", () => {
  it("refuses every value shape that cannot survive a history write", () => {
    // ⚑ ONE assertion over a signature, not six `it`s: a shape that stopped
    // being constructed would otherwise pass by running nothing.
    const verdicts = [
      ["function", { tab: (): number => 1 }],
      ["symbol", { tab: Symbol("s") }],
      ["bigint", { tab: 10n }],
      ["cycle", cyclicBag()],
      ["Date instance", { tab: new Date() }],
      ["Map instance", { tab: new Map() }],
    ].map(([label, search]) => [label, isStateStrict({ ...BASE, search })]);

    expect(verdicts).toStrictEqual([
      ["function", false],
      ["symbol", false],
      ["bigint", false],
      ["cycle", false],
      ["Date instance", false],
      ["Map instance", false],
    ]);
  });

  it("POSITIVE CONTROL — still accepts everything a real query string parses to", () => {
    // ⚠ This is the cell that makes the fix a fix rather than a refusal. The
    // query channel's value domain is NOT the path channel's: a repeated key
    // parses to an ARRAY and a bare `?flag` to `null`. Measured through the
    // matcher, `/list?a=1&a=2&tab=x&flag` yields
    // `{"a":[1,2],"tab":"x","flag":null}` — all three must survive.
    const accepted = [
      { a: ["1", "2"] },
      { a: [1, 2] },
      { flag: null },
      { tab: "x" },
      { n: 5 },
      { b: true },
      { nested: { deep: "1" } },
      {},
    ].map((search) => isStateStrict({ ...BASE, search }));

    expect(accepted).toStrictEqual([
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
    ]);
  });

  it("POSITIVE CONTROL — `search` stays OPTIONAL, so a pre-M2 entry still restores", () => {
    // Entries written before RFC-4 M2 (#1548) carry no query channel at all;
    // `makeState` reuses the frozen empty bag for them. Requiring `search`
    // would break every Back to such an entry.
    expect(isStateStrict(BASE)).toBe(true);
    expect(isStateStrict({ ...BASE, search: undefined })).toBe(true);
  });

  it("CONTROL — the shape half #1838 closed is still closed", () => {
    // Not a duplicate of `state-guard-mirror-1838`: it pins that those two are
    // refused; this pins that the value-level check did not REPLACE the shape
    // check when it composed with it.
    expect(isStateStrict({ ...BASE, search: "NOT-AN-OBJECT" })).toBe(false);
    expect(isStateStrict({ ...BASE, search: ["a", "b"] })).toBe(false);
  });

  it("CONTROL — the path channel is unchanged, and was never the defect", () => {
    // The asymmetry ran one way: `params` already refused all of these.
    const params = [
      { id: (): number => 1 },
      { id: 10n },
      { id: Symbol("s") },
    ].map((bag) => isStateStrict({ name: "u", path: "/u", params: bag }));

    expect(params).toStrictEqual([false, false, false]);
    expect(isStateStrict({ name: "u", path: "/u", params: { id: "1" } })).toBe(
      true,
    );
  });
});
