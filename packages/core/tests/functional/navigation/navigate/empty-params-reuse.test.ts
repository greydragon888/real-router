import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { createTestRouter } from "../../../helpers";

import type { Router } from "@real-router/core";

// #1027: an empty-params navigation (a static/root route with no params and no
// defaultParams) must reuse one shared frozen params singleton for state.params
// instead of allocating a fresh frozen {} per navigation. `makeState` has the
// reuse branch (params === EMPTY_PARAMS), but `normalizeParams` always returned
// a fresh {} so the branch missed. Identity is publicly observable here because
// navigate returns the committed State (unlike buildPath, which consumes params
// internally — see normalizeParams.test.ts), so distinct empty-params
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

  it("does not reuse the singleton when the navigation carries params", async () => {
    const empty = await router.navigate("sign-in");
    const withParam = await router.navigate("items", { id: "42" });

    // A params-bearing navigation must NOT collapse onto the empty singleton.
    expect(withParam.params).not.toBe(empty.params);
    expect(withParam.params).toStrictEqual({ id: "42" });
  });
});
