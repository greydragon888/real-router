import { createRouter } from "@real-router/core";
import { describe, expect, it, vi } from "vitest";

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
  it("the bypassed source is a REAL source — destroy() unwinds, and the args are forwarded", async () => {
    // ⚑ Three things no other cell here observes, each proven by a surviving
    // mutant: `destroy()` replaced by a no-op passed 290/290 while leaking the
    // router subscription for the router's lifetime — and the JSDoc this PR
    // edited promises the opposite; the whole ARGUMENT LIST is unobserved,
    // because core's gate refuses first and `getSnapshot()` is `false` whatever
    // is forwarded (swapping `params`/`search`, swapping the two booleans, or
    // substituting a route that does not exist all passed); and the gate itself
    // can be moved BELOW the cache-key template literal, so the coercion it
    // exists to prevent still runs.
    const router = createRouter(ROUTES, {});

    await router.start("/users");

    let reads = 0;
    const bag = {
      toString: () => {
        reads += 1;

        return "users";
      },
    };
    const originalSubscribe = router.subscribe.bind(router);
    const unsubs: (() => void)[] = [];

    vi.spyOn(router, "subscribe").mockImplementation((listener) => {
      const real = originalSubscribe(listener);
      const spy = vi.fn(() => {
        real();
      });

      unsubs.push(spy);

      return spy;
    });

    const seen: unknown[][] = [];

    vi.spyOn(router, "isActiveRoute").mockImplementation(
      (...args: unknown[]) => {
        seen.push(args);

        return false;
      },
    );

    const source = createActiveRouteSource(
      router,
      bag as never,
      { a: "1" },
      { b: "2" },
      { strict: true, ignoreQueryParams: false },
    );

    // The gate runs BEFORE the cache key, so the bag is never coerced.
    expect(reads).toBe(0);
    // The caller's arguments reach the predicate in their declared order.
    expect(source.getSnapshot()).toBe(false);
    expect(seen).toHaveLength(1);
    expect(seen[0]?.[0]).toBe(bag);
    expect(seen[0]?.[1]).toStrictEqual({ a: "1" });
    expect(seen[0]?.[2]).toStrictEqual({ b: "2" });
    expect(seen[0]?.[3]).toBe(true);

    // And it is a real source: subscribing opens one router subscription, and
    // destroy() unwinds exactly that one.
    source.subscribe(() => {});

    expect(unsubs).toHaveLength(1);
    // ⚑ NO `off()` here, deliberately. The subscribe's own unsubscribe would
    // unwind the router handle by itself, and the assertion below would then
    // pass whatever `destroy()` does — measured, it did: a no-op `destroy`
    // passed all 290 tests while `off()` was in place. `destroy()` has to be
    // the only thing that could have unwound it.
    expect(unsubs[0]).not.toHaveBeenCalled();

    source.destroy();

    expect(unsubs[0]).toHaveBeenCalledTimes(1);

    vi.restoreAllMocks();
    router.dispose();
  });

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
    // one. Deleting the bypass reds this cell too, on the bag's own snapshot: the
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
