import { createRouter } from "@real-router/core";
import { describe, expect, it, vi } from "vitest";

import { createActiveRouteSource } from "../../src";

/**
 * A non-string route name must not share a cache slot with a well-typed one
 * (#1881 follow-up).
 *
 * The cache key is a template literal, so it COERCES the name: a bag whose
 * `toString` returns `"users"` and the string `"users"` produce the identical
 * key, and the cached source is whichever call arrived FIRST. Core does not
 * gate the name (`packages/core/ARCHITECTURE.md`, "Route-Name Type Gates") — it
 * compares the active name by IDENTITY before it ever coerces, so the bag
 * answers `false` on a route the string answers `true` on. Sharing one slot
 * therefore lets the bad call decide for the good one, in whichever order they
 * arrive.
 */
const ROUTES = [{ name: "users", path: "/users" }];

// The slow path — the fast name-only selector never reaches `isActiveRoute`.
const OPTS = { ignoreQueryParams: false };

describe("active-route source cache key (#1881 follow-up)", () => {
  it("the bypassed source is a REAL source — destroy() unwinds, and the args are forwarded", async () => {
    // ⚑ Three things no other cell here observes, each proven by a surviving
    // mutant: `destroy()` replaced by a no-op passed 290/290 while leaking the
    // router subscription for the router's lifetime — and this factory's JSDoc
    // promises the opposite; the whole ARGUMENT LIST is unobserved without the
    // spy below, because `getSnapshot()` is `false` whatever is forwarded
    // (swapping `params`/`search`, swapping the two booleans, or substituting a
    // route that does not exist all passed); and the bypass itself can be moved
    // BELOW the cache-key template literal, so the coercion it exists to
    // prevent still runs.
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

  it("a bag-named source built FIRST does not darken the well-typed sibling", async () => {
    // ⚑ The fixture is `users`, a PLAIN name, and that is load-bearing: for a
    // name resolving through `forwardTo` the bag and the string compute the SAME
    // boolean, so a `fwd` fixture cannot see the collision at all. The identity
    // check below is what reds when the bypass is deleted — and so does the
    // well-typed snapshot, which is the production symptom: `<Link to="users">`
    // dark while the router is on `/users`.
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

  it("the reverse order is the MIRROR defect — the bag reports ACTIVE on a route it does not name", async () => {
    // ⚑ NOT a duplicate of the cell above and NOT a control: deleting the
    // bypass reds this one on the BAG's snapshot instead of the string's. The
    // bag inherits the well-typed source and reports ACTIVE for a value that
    // names no route, so the pair pins both directions of the shared slot. The
    // `solo` assertion at the end is the only real control here.
    const router = createRouter(ROUTES, {});

    await router.start("/users");

    const good = createActiveRouteSource(router, "users", {}, {}, OPTS);
    const bag = { toString: () => "users" };
    const bad = createActiveRouteSource(router, bag as never, {}, {}, OPTS);

    expect(good.getSnapshot()).toBe(true);
    expect(bad.getSnapshot()).toBe(false);

    good.destroy();
    bad.destroy();

    // And alone, with no bag anywhere near it.
    const solo = createActiveRouteSource(router, "users", {}, {}, OPTS);

    expect(solo.getSnapshot()).toBe(true);

    solo.destroy();
    router.dispose();
  });
});
