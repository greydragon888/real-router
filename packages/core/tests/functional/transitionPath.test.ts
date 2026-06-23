import { describe, it, expect, afterEach } from "vitest";

import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

import type { Route, Router } from "@real-router/core";

/**
 * Transition-path behaviour via the PUBLIC pipeline — audit 2026-06-23.
 *
 * `transitionPath.ts` is a fully INTERNAL module (nothing here is in
 * `@real-router/core`'s exports). Its pure functions run on every navigation and
 * their observable contract is `state.transition.segments`. Every branch is
 * reachable through the public API, so this suite is fully public (no white-box):
 *   - nameToIDs ladder + FAST PATH 1 (no fromState) → `navigate()` / `start()` +
 *     `state.transition.segments` (exact chains);
 *   - meta-AWARE deactivation + `segmentParamsEqual` → `navigate()` swaps;
 *   - meta-LESS FAST PATH 3 (full reload) → `router.shouldUpdateNode()` fed
 *     meta-less `router.makeState(...)` states. (navigate() never produces a
 *     meta-less state — `buildNavigateState` always attaches `getMetaForState` —
 *     so this is the public door to FAST PATH 3.)
 *
 * The generative coverage lives in the property suites
 * (`nameToIDs.properties.ts`, `transitionSegments.properties.ts`) which Stryker
 * does not run, so the example-based assertions here are the Stryker-visible
 * mirror.
 */

/** Builds a linear nested route chain from cumulative segment names. */
function linearChain(segments: string[]): Route[] {
  let node: Route | undefined;

  for (let i = segments.length - 1; i >= 0; i--) {
    node = {
      name: segments[i],
      path: `/${segments[i]}`,
      ...(node ? { children: [node] } : {}),
    };
  }

  return [node!];
}

describe("transition.segments — activation chain by depth (nameToIDs ladder + FAST PATH 1)", () => {
  let router: Router | undefined;

  afterEach(() => {
    router?.stop();
    router = undefined;
  });

  // Depth 1..6 covers computeNameToIDs's first/second/third/fourth-dot fast paths
  // plus nameToIDsGeneral's `i < segmentCount - 1` loop (5+ segments). The initial
  // navigation (no fromState) is FAST PATH 1: the activated chain IS the
  // cumulative-id output and deactivation is empty.
  it.each([
    { segs: ["a"] },
    { segs: ["a", "b"] },
    { segs: ["a", "b", "c"] },
    { segs: ["a", "b", "c", "d"] },
    { segs: ["a", "b", "c", "d", "e"] },
    { segs: ["a", "b", "c", "d", "e", "f"] },
  ])(
    "$segs.length segment(s) → cumulative activation chain, empty deactivation",
    async ({ segs }) => {
      const leafName = segs.join(".");

      router = createRouter(linearChain(segs), { defaultRoute: leafName });

      const state = await router.start(`/${segs.join("/")}`);
      const expected = segs.map((_, i) => segs.slice(0, i + 1).join("."));

      expect([...state.transition.segments.activated]).toStrictEqual(expected);
      expect([...state.transition.segments.deactivated]).toStrictEqual([]);
      expect(state.transition.segments.intersection).toBe("");
    },
  );
});

describe("getTransitionPath meta-less FAST PATH 3 — full reload via shouldUpdateNode(makeState)", () => {
  let router: Router | undefined;

  afterEach(() => {
    router?.stop();
    router = undefined;
  });

  // FAST PATH 3 fires only when getTransitionPath receives states with NO meta
  // (getStateMetaParams undefined). `navigate()` never produces those, but the
  // public `router.makeState(name, params)` (no meta arg) does — and feeding two
  // of them to the public `router.shouldUpdateNode()` drives FAST PATH 3. The
  // boolean is keyed on toActivate/toDeactivate MEMBERSHIP (a missing-meta
  // transition is a FULL reload: every from-chain and to-chain node updates) —
  // what a consumer actually observes. (FAST PATH 3's `toDeactivate` order is
  // unobservable — only `shouldUpdateNode` reaches it, by membership — so the
  // from-chain is returned root→leaf without a reverse; see transitionPath.ts.)
  it("treats a meta-less transition as a full reload (every from/to node updates)", () => {
    router = createRouter([
      {
        name: "a",
        path: "/a",
        children: [
          { name: "b", path: "/b", children: [{ name: "c", path: "/c" }] },
        ],
      },
      { name: "x", path: "/x" },
    ]);

    const api = getPluginApi(router);
    const to = api.makeState("x", {}); // no meta → meta-less
    const from = api.makeState("a.b.c", {}); // no meta → meta-less

    // Whole from-chain deactivates (membership; a dropped chain entry — e.g.
    // losing the root "a" — would flip its predicate to false).
    expect(router.shouldUpdateNode("a")(to, from)).toBe(true);
    expect(router.shouldUpdateNode("a.b")(to, from)).toBe(true);
    expect(router.shouldUpdateNode("a.b.c")(to, from)).toBe(true);
    // to-chain activates.
    expect(router.shouldUpdateNode("x")(to, from)).toBe(true);
    // unrelated node is untouched.
    expect(router.shouldUpdateNode("zzz")(to, from)).toBe(false);
  });
});

describe("transition.segments — deactivation order + ancestor identity (segmentParamsEqual)", () => {
  let router: Router | undefined;

  afterEach(() => {
    router?.stop();
    router = undefined;
  });

  // STANDARD PATH (meta-aware) builds the deactivation list leaf→root inline; the
  // exact order is observable on `state.transition.segments` after a navigate.
  it("param-less full swap: deactivated is the from-chain leaf→root", async () => {
    const tree: Route[] = [
      {
        name: "a",
        path: "/a",
        children: [
          { name: "b", path: "/b", children: [{ name: "c", path: "/c" }] },
        ],
      },
      { name: "x", path: "/x" },
    ];

    router = createRouter(tree, { defaultRoute: "x" });
    await router.start("/a/b/c");

    const state = await router.navigate("x");
    const { deactivated, activated, intersection } = state.transition.segments;

    expect([...deactivated]).toStrictEqual(["a.b.c", "a.b", "a"]);
    expect([...activated]).toStrictEqual(["x"]);
    expect(intersection).toBe("");
  });

  // segmentParamsEqual: a name-matching ancestor stays mounted IFF its OWN param
  // is unchanged. Kills the `&& / ||` and `String(...) !==` mutants.
  const paramTree: Route[] = [
    { name: "home", path: "/home" },
    {
      name: "parent",
      path: "/parent/:pid",
      children: [
        { name: "childA", path: "/a" },
        { name: "childB", path: "/b" },
      ],
    },
  ];

  it("meta-param ancestor STAYS mounted when its param is unchanged", async () => {
    router = createRouter(paramTree, { defaultRoute: "home" });
    await router.start("/home");
    await router.navigate("parent.childA", { pid: "1" });

    const state = await router.navigate("parent.childB", { pid: "1" });
    const { deactivated, activated, intersection } = state.transition.segments;

    expect(intersection).toBe("parent");
    expect([...deactivated]).toStrictEqual(["parent.childA"]);
    expect([...activated]).toStrictEqual(["parent.childB"]);
  });

  it("meta-param ancestor RE-MOUNTS when its own param changes", async () => {
    router = createRouter(paramTree, { defaultRoute: "home" });
    await router.start("/home");
    await router.navigate("parent.childA", { pid: "1" });

    const state = await router.navigate("parent.childB", { pid: "2" });
    const { deactivated, activated, intersection } = state.transition.segments;

    expect(intersection).toBe("");
    expect([...deactivated]).toStrictEqual(["parent.childA", "parent"]);
    expect([...activated]).toStrictEqual(["parent", "parent.childB"]);
  });
});
