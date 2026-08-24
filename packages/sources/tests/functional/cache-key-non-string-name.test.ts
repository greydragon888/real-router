import { createRouter } from "@real-router/core";
import { describe, expect, it } from "vitest";

import { createActiveRouteSource } from "../../src";

/**
 * A non-string route name must not share a cache slot with a well-typed one
 * (#1881 follow-up).
 *
 * The cache key is a template literal, so it COERCES the name: a bag whose
 * `toString` returns `"fwd"` and the string `"fwd"` produce the identical key.
 * While core coerced the name too, both calls computed the same boolean and the
 * collision was invisible. Once core refuses a non-string, the two disagree —
 * and the cached source is whichever arrived FIRST, so the well-typed caller
 * inherits the refusal and its `<Link>` goes dark on a route it is on.
 */
const ROUTES = [
  { name: "users", path: "/users" },
  { name: "fwd", path: "/fwd", forwardTo: "users" },
];

// The slow path — the fast name-only selector never reaches `isActiveRoute`.
const OPTS = { ignoreQueryParams: false };

describe("active-route source cache key (#1881 follow-up)", () => {
  it("a PLAIN name darkens too — that half of the defect predates the gate", async () => {
    // ⚑ The fixture below uses `fwd`, which resolves through `forwardTo`, and
    // that is the shape where the collision USED to be invisible: the router
    // coerced the name, both calls computed `true`, and nobody noticed. For a
    // plain name it was never invisible — measured on the previous release, a
    // bag-named source built first already left `createActiveRouteSource(r,
    // "users", …)` reporting `false` while the router was on `/users`.
    //
    // So this cell is not a duplicate: it pins the half that is a PRE-EXISTING
    // production defect rather than a consequence of the route-name gates, and
    // a fixture built only on `fwd` cannot see it.
    const router = createRouter(ROUTES, {});

    await router.start("/users");

    const bag = { toString: () => "users" };
    const bad = createActiveRouteSource(router, bag as never, {}, {}, OPTS);
    const good = createActiveRouteSource(router, "users", {}, {}, OPTS);

    expect(bad).not.toBe(good);
    expect(good.getSnapshot()).toBe(true);
    expect(bad.getSnapshot()).toBe(false);

    bad.destroy();
    good.destroy();
    router.dispose();
  });

  it("a bag-named source built FIRST does not darken the well-typed sibling", async () => {
    const router = createRouter(ROUTES, {});

    await router.start("/users");

    const bag = { toString: () => "fwd" };
    const bad = createActiveRouteSource(router, bag as never, {}, {}, OPTS);
    const good = createActiveRouteSource(router, "fwd", {}, {}, OPTS);

    // The two must be different objects — sharing one is the defect itself.
    expect(bad).not.toBe(good);
    // And the well-typed call answers for the route it names.
    expect(good.getSnapshot()).toBe(true);
    // The bag inherits core's refusal, which is the point of #1881.
    expect(bad.getSnapshot()).toBe(false);

    bad.destroy();
    good.destroy();
    router.dispose();
  });

  it("the reverse order is the MIRROR defect — the bag reports ACTIVE on a route it does not name", async () => {
    const router = createRouter(ROUTES, {});

    await router.start("/users");

    // ⚑ NOT a control, and an earlier revision of this file wrongly labelled it
    // one. Deleting the bypass reds this cell too, on the LAST assertion: the
    // bag inherits the well-typed source and reports ACTIVE — the fail-open the
    // sibling `isActiveRoute` fix exists to close, resurrected through a shared
    // cache slot. Both orders were broken, in opposite directions, so the pair
    // does not isolate order-dependence; the `solo` assertion below is the only
    // real control here.
    const good = createActiveRouteSource(router, "fwd", {}, {}, OPTS);
    const bag = { toString: () => "fwd" };
    const bad = createActiveRouteSource(router, bag as never, {}, {}, OPTS);

    expect(good.getSnapshot()).toBe(true);
    expect(bad.getSnapshot()).toBe(false);

    good.destroy();
    bad.destroy();

    // And alone, with no bag anywhere near it.
    const solo = createActiveRouteSource(router, "fwd", {}, {}, OPTS);

    expect(solo.getSnapshot()).toBe(true);

    solo.destroy();
    router.dispose();
  });
});
