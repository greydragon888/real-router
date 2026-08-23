import { describe, expect, it } from "vitest";

import { createRouter } from "@real-router/core";

/**
 * `isActiveRoute` answers about a route NAME, and a non-string is not one
 * (#1881).
 *
 * The predicate reaches the same forward maps `defaultRoute` did (#1876), and
 * used the caller's value as a property key at up to nine sites. Through the
 * `forwardTo` arm the answer was then indistinguishable from the string call —
 * a `<Link>` could report itself active on a value that never named a route.
 */
const ROUTES = [
  { name: "home", path: "/home" },
  { name: "fwd", path: "/fwd", forwardTo: "home" },
  { name: "plain", path: "/plain" },
];

const counting = (answer: string) => {
  let reads = 0;

  return {
    bag: {
      toString: () => {
        reads += 1;

        return answer;
      },
    },
    get reads(): number {
      return reads;
    },
  };
};

describe("isActiveRoute refuses a non-string name (#1881)", () => {
  it("a value naming the ACTIVE forwarding route is not active, and is never read", async () => {
    const probe = counting("fwd");
    const router = createRouter(ROUTES, {});

    await router.start("/home");

    // CONTROL first: the string form says true, so the cell cannot pass by
    // making the predicate answer false for everything.
    expect(router.isActiveRoute("fwd", {})).toBe(true);

    expect(router.isActiveRoute(probe.bag as never, {})).toBe(false);
    expect(probe.reads).toBe(0);

    router.dispose();
  });

  it("CONTROL — an inactive name is false either way, and a string still works", async () => {
    const probe = counting("plain");
    const router = createRouter(ROUTES, {});

    await router.start("/home");

    expect(router.isActiveRoute("plain", {})).toBe(false);
    expect(router.isActiveRoute(probe.bag as never, {})).toBe(false);
    expect(probe.reads).toBe(0);
    expect(router.isActiveRoute("home", {})).toBe(true);

    router.dispose();
  });
});
