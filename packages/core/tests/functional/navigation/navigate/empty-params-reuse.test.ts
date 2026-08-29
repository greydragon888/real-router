import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { createTestRouter } from "../../../helpers";

import type { Router } from "@real-router/core";

// #1027: an empty-params navigation (a static/root route with no params and no
// defaultParams) must reuse one shared frozen params singleton for state.params
// instead of allocating a fresh frozen {} per navigation. `makeState` has the
// reuse branch (params === EMPTY_PARAMS), but the channel normaliser always
// returned a fresh {} so the branch missed. Identity is publicly observable here because
// navigate returns the committed State (unlike buildPath, which consumes params
// internally — see normalizeParams.test.ts, which covers the same normaliser
// under its former name), so distinct empty-params
// navigations must commit the SAME params reference.
describe("router.navigate() - empty-params reuse one frozen params singleton (#1027)", () => {
  let router: Router;

  beforeEach(async () => {
    router = createTestRouter();

    await router.start("/home");
  });

  afterEach(() => {
    router.stop();
  });

  it("shares one frozen params reference across distinct empty-params navigations", async () => {
    const a = await router.navigate("sign-in");
    const b = await router.navigate("index");
    const c = await router.navigate("home");

    // Public observability of the reuse: every empty-params navigation commits
    // the SAME params reference. Before the fix each allocated its own fresh {},
    // so a.params !== b.params. The shared object is empty and frozen.
    expect(a.params).toBe(b.params);
    expect(b.params).toBe(c.params);
    expect(Object.keys(a.params)).toStrictEqual([]);
    expect(Object.isFrozen(a.params)).toBe(true);
  });

  // ⚑ WHICH singleton, not just "one shared reference". #1812 turned the empty
  // bag into a PARAMETER of the channel normaliser (`normalizeChannel(bag, empty)`)
  // so one implementation could serve both channels. Before that the path
  // normaliser named `EMPTY_PARAMS` as a constant and the two channels could not
  // be crossed; now the caller chooses, and passing the wrong sibling makes both
  // channels commit the SAME object — measured, and green across the whole suite
  // without this cell. `EMPTY_PARAMS` and `EMPTY_SEARCH` are compared by identity
  // in the channel merge (`value === empty`) and at `canonicalize`'s fast-path
  // test, so crossing them is not cosmetic.
  it("keeps the two channels on DISTINCT empty singletons", async () => {
    // ⚠ The bags are passed EXPLICITLY, and that is what makes this cell
    // discriminate. With the argument OMITTED, `canonicalize` short-circuits on
    // its `undefined` / already-the-singleton test and never reaches the
    // normaliser, so the swap is invisible — measured: the omitted form is
    // byte-identical under both spellings. A literal `{}` (or an all-`undefined`
    // bag) is the shape that walks the line under test.
    const a = await router.navigate("sign-in", {}, {});
    const b = await router.navigate("index", {}, {});

    // Same channel across navigations: shared (the #1027 contract above).
    expect(a.params).toBe(b.params);
    expect(a.search).toBe(b.search);

    // Across channels: never the same object, however empty both are.
    expect(a.params).not.toBe(a.search);
    expect(Object.keys(a.search)).toStrictEqual([]);
    expect(Object.isFrozen(a.search)).toBe(true);
  });

  it("does not reuse the singleton when the navigation carries params", async () => {
    const empty = await router.navigate("sign-in");
    const withParam = await router.navigate("items", { id: "42" });

    // A params-bearing navigation must NOT collapse onto the empty singleton.
    expect(withParam.params).not.toBe(empty.params);
    expect(withParam.params).toStrictEqual({ id: "42" });
  });
});
