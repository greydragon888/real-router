import { describe, it, expect } from "vitest";

import { createRouter } from "@real-router/core";
import { getPluginApi, getRoutesApi } from "@real-router/core/api";

import type { State } from "@real-router/core/types";

/**
 * State freeze semantics (`freezeStateShell`, src/helpers.ts).
 *
 * The observable contract is proven through the PUBLIC pipeline: every committed
 * state from `navigate()` / `getState()` is top-level frozen, its `context` stays
 * writable (so plugins can publish via `claim.write`), and the cached reference is
 * returned unchanged on repeat reads (the already-frozen no-op path). The old
 * white-box "shallow — does not freeze params/meta" assertions are dropped: via
 * navigate, `params` is frozen UPSTREAM by `setState`, and the meta WeakMap store
 * is covered by transitionPath/state tests — neither is observable here.
 *
 * `freezeStateShell` runs on every navigation (StateNamespace freezes via it),
 * so it is fully covered here. Its former `!state` guard was redundant cruft
 * (`Object.freeze` returns null/undefined as-is) and has been removed from src —
 * hence no white-box null test remains.
 */
describe("State freeze semantics (via navigate + getState)", () => {
  const make = () =>
    createRouter([
      { name: "home", path: "/" },
      { name: "user", path: "/users/:id" },
    ]);

  it("freezes the committed state's top level (reassignment throws)", async () => {
    const router = make();

    await router.start("/");
    await router.navigate("user", { id: "123" });

    const state = router.getState()!;

    expect(Object.isFrozen(state)).toBe(true);
    expect(() => {
      (state as unknown as { name: string }).name = "modified";
    }).toThrow();
    expect(() => {
      (state as unknown as { path: string }).path = "/new";
    }).toThrow();
  });

  it("leaves state.context unfrozen so plugins can publish via claim.write", async () => {
    const router = make();

    await router.start("/");

    const context = router.getState()!.context as Record<string, unknown>;

    expect(Object.isFrozen(context)).toBe(false);
    expect(() => {
      context.custom = "written by plugin";
    }).not.toThrow();
    expect(context.custom).toBe("written by plugin");
  });

  it("returns the same frozen reference on repeated getState (already-frozen no-op)", async () => {
    const router = make();

    await router.start("/");

    const first = router.getState();
    const second = router.getState();

    expect(first).toBe(second);
    expect(Object.isFrozen(first)).toBe(true);
  });
});

/**
 * The producer matrix (#1599).
 *
 * "States are deeply frozen" is a documented guarantee with NO single owner: the
 * depth is assembled from unrelated places — `mergeQueryChannel`, the
 * `EMPTY_*` singletons, `admittedSearch` in the mode gate, `materialize` for
 * `params` (#1598 / #1928, the one owner that IS at publication), and the shell
 * freeze above — and only one of them is the publisher. The describe above proves the
 * guarantee for ONE producer (navigate). This proves it for every producer that
 * can hand a state to user code, which is what makes the assembly safe to
 * REARRANGE: #1598 moves one of the four sites, and without this matrix that move
 * would be invisible to CI whether it was right or wrong.
 *
 * Deliberately black-box, through the public surface each producer is reached by.
 * `context` is the one documented carve-out (plugins write into it after the
 * commit), so it is asserted mutable rather than frozen — that asymmetry IS the
 * contract, not an omission.
 */
describe("state immutability across every producer (#1599)", () => {
  const ROUTES = [
    { name: "home", path: "/home" },
    { name: "user", path: "/users/:id" },
    { name: "query", path: "/q?a" },
    { name: "defaults", path: "/d/:x", defaultParams: { x: "1" } },
  ];

  const make = () =>
    createRouter(ROUTES, { defaultRoute: "home", allowNotFound: true });

  /** Every channel a published state exposes, plus the documented carve-out. */
  const expectPublishedShape = (state: State | undefined) => {
    expect(state).toBeDefined();
    expect(Object.isFrozen(state)).toBe(true);
    expect(Object.isFrozen(state!.params)).toBe(true);
    expect(Object.isFrozen(state!.search)).toBe(true);
    expect(Object.isFrozen(state!.transition)).toBe(true);
    // The carve-out: `claimContextNamespace` depends on this staying writable.
    expect(Object.isFrozen(state!.context)).toBe(false);
  };

  // eslint-disable-next-line vitest/expect-expect -- assertions live in expectPublishedShape()
  it("navigate — path params (fast path)", async () => {
    const router = make();

    await router.start("/users/7");

    expectPublishedShape(router.getState());
  });

  // ⚠ The cell that matters most, and the one the first draft of this matrix
  // MISSED: the transition pipeline commits through `materialize({skipFreeze:
  // true})`, so on this path nothing downstream freezes the channels — and it only
  // bites with a NON-EMPTY bag on the fast path, because an empty one collapses to
  // the already-frozen `EMPTY_PARAMS` singleton and a route with defaults is
  // frozen by `mergeQueryChannel` instead. `start()` does not cover it either: it
  // commits through the `matchPath` rebuild. Found by mutation — moving the
  // `materialize` freeze below the `skipFreeze` branch left every other case here
  // green.
  // eslint-disable-next-line vitest/expect-expect -- assertions live in expectPublishedShape()
  it("navigate — non-empty params through the transition pipeline (skipFreeze)", async () => {
    const router = make();

    await router.start("/home");
    await router.navigate("user", { id: "9" });

    expectPublishedShape(router.getState());
  });

  // eslint-disable-next-line vitest/expect-expect -- assertions live in expectPublishedShape()
  it("navigate — query channel", async () => {
    const router = make();

    await router.start("/home");
    await router.navigate("query", {}, { a: "1" });

    expectPublishedShape(router.getState());
  });

  // eslint-disable-next-line vitest/expect-expect -- assertions live in expectPublishedShape()
  it("navigate — route defaults (slow path)", async () => {
    const router = make();

    await router.start("/home");
    await router.navigate("defaults");

    expectPublishedShape(router.getState());
  });

  // eslint-disable-next-line vitest/expect-expect -- assertions live in expectPublishedShape()
  it("makeState — the plugin primitive, with and without params", async () => {
    const router = make();

    await router.start("/home");

    const api = getPluginApi(router);

    expectPublishedShape(api.makeState("user", { id: "9" }));
    expectPublishedShape(api.makeState("home"));
  });

  // eslint-disable-next-line vitest/expect-expect -- assertions live in expectPublishedShape()
  it("navigateToNotFound — the one producer that bypasses the pipeline", async () => {
    const router = make();

    await router.start("/home");
    router.navigateToNotFound("/nope");

    expectPublishedShape(router.getState());
  });

  // The mode gate freezes the query channel itself (`admittedSearch`), and reaching
  // that freeze needs TWO conditions the happy path does not meet — both found by
  // mutation while building this matrix, neither by reading:
  //
  //   1. a non-`loose` mode, because `loose` is the repo default and short-circuits
  //      the gate entirely;
  //   2. a key that is actually DROPPED **and** one that is admitted — the no-drop
  //      branch hands back the input, already frozen by `mergeQueryChannet`, and an
  //      all-dropped bag collapses to the frozen `EMPTY_SEARCH` singleton. Only the
  //      mixed case builds the fresh object this freeze exists for.

  it("non-loose mode with a dropped key — the mode gate's own freeze", async () => {
    const router = createRouter(ROUTES, {
      defaultRoute: "home",
      queryParamsMode: "strict",
    });

    await router.start("/home");
    await router.navigate("query", {}, { a: "1", undeclared: "9" });

    const state = router.getState();

    expectPublishedShape(state);

    // The gate dropped it, so the freeze under test ran on a bag it built itself.
    expect(state?.search).toStrictEqual({ a: "1" });
  });

  // The two producers this matrix MISSED until #1641's §12.10 pass. Both were
  // correct already — that is exactly why they are worth pinning: an unpinned
  // correct producer is one refactor away from a silent exception, and neither
  // is reachable through `getState()`, so nothing else here reaches them.
  //
  // ⚠ Measured, so the claim is calibrated: against the mutation "materialize
  // stops freezing the shell" these two fail TOGETHER WITH `makeState`, i.e.
  // for that particular defect they add nothing. Their job is EXIT coverage,
  // not that mutation — they are what notices if either producer ever grows a
  // state-construction of its own, which the freeze census in
  // `state-freeze-authority.test.ts` would flag as a sixth constructor while
  // this says whether the result is still correctly shaped.
  // eslint-disable-next-line vitest/expect-expect -- assertions live in expectPublishedShape()
  it("matchPath — the URL direction, which never commits", async () => {
    const router = make();

    await router.start("/home");

    const api = getPluginApi(router);

    // Both arms: a plain match, and one that carries a query channel.
    expectPublishedShape(api.matchPath("/users/7"));
    expectPublishedShape(api.matchPath("/q?a=1"));
  });

  // eslint-disable-next-line vitest/expect-expect -- assertions live in expectPublishedShape()
  it("buildNavigationState — the intent direction, which never commits either", async () => {
    const router = make();

    await router.start("/home");

    const api = getPluginApi(router);

    expectPublishedShape(api.buildNavigationState("user", { id: "9" }));
    // The defaults arm, so the SLOW merge path is pinned here too.
    expectPublishedShape(api.buildNavigationState("defaults"));
  });

  // eslint-disable-next-line vitest/expect-expect -- assertions live in expectPublishedShape()
  it("replace() revalidation — a state committed by route-CRUD", async () => {
    const router = make();

    await router.start("/users/7");

    getRoutesApi(router).replace([
      { name: "home", path: "/home" },
      { name: "user", path: "/users/:id" },
    ]);

    expectPublishedShape(router.getState());
  });
});
