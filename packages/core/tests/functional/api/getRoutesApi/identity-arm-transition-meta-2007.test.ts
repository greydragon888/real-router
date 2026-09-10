import { describe, expect, it } from "vitest";

import { createRouter } from "@real-router/core";
import { getRoutesApi } from "@real-router/core/api";

/**
 * `replace()`'s revalidation has three arms, and only the route-identity one
 * committed a transition meta describing a transition that did not happen
 * (#2007).
 *
 * ⚑ The other two settle what the right answer is, so this is not a fork the
 * cells below invent. The SURVIVOR arm copies the prior meta on purpose — same
 * route at the same path, the user was legitimately there, and seventeen lines
 * beside it say so. The VANISHED arm BUILDS one: `commitNotFound` assembles
 * `from`, both segment lists and `replace: true` from the states it holds. The
 * identity arm copied, with nothing beside it, and named a route the tree no
 * longer holds.
 *
 * ⚠ `replace: true` is DERIVED, not inherited, and the issue's own expectation
 * table said `undefined` here. Measured: the vanished arm reaches
 * `systemCommit` with `FROZEN_REPLACE_OPTS`, so a revalidation commit is a
 * replace by construction on that arm; the identity arm's `true` was `start()`'s
 * option riding across, which is the same value for the wrong reason. Building
 * it makes the value answerable rather than accidental.
 */
describe("#2007 — the identity arm describes the transition it performed", () => {
  it("names the NEW route in the committed segments, and the OLD one as departed", async () => {
    const router = createRouter([
      { name: "home", path: "/home" },
      { name: "x", path: "/a" },
    ]);

    await router.start("/a");

    // The same URL, a DIFFERENT route: `/a` now belongs to `y`.
    getRoutesApi(router).replace([
      { name: "home", path: "/home" },
      { name: "y", path: "/a" },
    ]);

    const state = router.getState();

    expect(state?.name).toBe("y");
    expect(state?.transition.segments.activated).toStrictEqual(["y"]);
    expect(state?.transition.segments.deactivated).toStrictEqual(["x"]);
    expect(state?.transition.from).toBe("x");
    expect(state?.transition.reason).toBe("success");
    expect(state?.transition.replace).toBe(true);
  });

  it("walks the whole segment chain, not just the leaf", async () => {
    const router = createRouter([
      {
        name: "shop",
        path: "/shop",
        children: [{ name: "old", path: "/item" }],
      },
    ]);

    await router.start("/shop/item");

    getRoutesApi(router).replace([
      {
        name: "shop",
        path: "/shop",
        children: [{ name: "fresh", path: "/item" }],
      },
    ]);

    const state = router.getState();

    expect(state?.name).toBe("shop.fresh");

    // `shop` is common to both, so it is the intersection rather than a
    // segment that moved — the same answer a real navigation between the two
    // would produce.
    expect(state?.transition.segments.activated).toStrictEqual(["shop.fresh"]);
    expect(state?.transition.segments.deactivated).toStrictEqual(["shop.old"]);
    expect(state?.transition.segments.intersection).toBe("shop");
    expect(state?.transition.from).toBe("shop.old");
  });

  it("CONTROL — the survivor arm still carries the prior meta forward", async () => {
    const router = createRouter([
      { name: "home", path: "/home" },
      { name: "x", path: "/a" },
    ]);

    await router.start("/home");
    await router.navigate("x");

    const before = router.getState()?.transition;

    // Same route, same path — the arm that copies deliberately.
    getRoutesApi(router).replace([
      { name: "home", path: "/home" },
      { name: "x", path: "/a" },
    ]);

    const after = router.getState()?.transition;

    expect(router.getState()?.name).toBe("x");
    expect(after).toStrictEqual(before);
  });

  it("CONTROL — the vanished arm is untouched", async () => {
    const router = createRouter([{ name: "gone", path: "/g" }], {
      allowNotFound: true,
    });

    await router.start("/g");

    getRoutesApi(router).replace([{ name: "other", path: "/o" }]);

    const state = router.getState();

    expect(state?.name).toBe("@@router/UNKNOWN_ROUTE");
    expect(state?.transition.segments.deactivated).toStrictEqual(["gone"]);
    expect(state?.transition.from).toBe("gone");
    expect(state?.transition.replace).toBe(true);
  });

  it("the committed meta and its segment arrays are frozen", async () => {
    const router = createRouter([
      { name: "home", path: "/home" },
      { name: "x", path: "/a" },
    ]);

    await router.start("/a");

    getRoutesApi(router).replace([
      { name: "home", path: "/home" },
      { name: "y", path: "/a" },
    ]);

    const meta = router.getState()?.transition;

    expect(Object.isFrozen(meta)).toBe(true);
    expect(Object.isFrozen(meta?.segments)).toBe(true);
    expect(Object.isFrozen(meta?.segments.activated)).toBe(true);
    expect(Object.isFrozen(meta?.segments.deactivated)).toBe(true);
  });
});
