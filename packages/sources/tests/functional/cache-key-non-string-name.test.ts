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

  it("CONTROL — order does not matter, and a lone well-typed source is unaffected", async () => {
    const router = createRouter(ROUTES, {});

    await router.start("/users");

    // Well-typed first, bag second: this direction was already correct before
    // the bypass, so it is the baseline that proves the cell above measures the
    // ORDER dependence rather than the refusal.
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
