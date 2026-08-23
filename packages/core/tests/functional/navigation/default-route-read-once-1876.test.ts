import { describe, expect, it } from "vitest";

import { createRouter } from "@real-router/core";

/**
 * `defaultRoute` is read ONCE, and a value that is not a route NAME cannot
 * navigate (#1876).
 *
 * The option is declared `string | callback`, so an object needs a cast in
 * TypeScript — and is ordinary in JavaScript, or in a config assembled at
 * runtime. Such a value used to be coerced as a PROPERTY KEY at four sites per
 * `navigateToDefault()` — `forwardFnMap`, `resolvedForwardMap`, `defaultParams`,
 * `defaultSearch` — six calls when the name resolved through a static
 * `forwardTo`, while a further consumer took it raw. They could disagree with
 * each other and with that raw read.
 */
const ROUTES = [
  { name: "home", path: "/home" },
  { name: "target", path: "/target" },
  { name: "fwd", path: "/fwd", forwardTo: "target" },
  { name: "start", path: "/start" },
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

describe("defaultRoute is read once, and a non-name cannot navigate (#1876)", () => {
  it("a non-string defaultRoute is never coerced, and refuses to navigate", async () => {
    const probe = counting("home");
    const router = createRouter(ROUTES, {
      defaultRoute: probe.bag,
    } as never);

    await router.start("/start");

    // ⚑ The REASON, not just the code: all three `defaultRoute` refusals in
    // `#navigateToDefault` carry `ROUTE_NOT_FOUND`, so a mutation folding this
    // gate into the `!route` one — and inheriting its "resolved to empty"
    // message, the reuse this fix explicitly rejects — passes the whole package
    // without it.
    await expect(router.navigateToDefault()).rejects.toMatchObject({
      code: "ROUTE_NOT_FOUND",
      routeName: "defaultRoute did not resolve to a route name",
    });
    expect(probe.reads).toBe(0);

    await expect(router.navigateToDefault()).rejects.toMatchObject({
      code: "ROUTE_NOT_FOUND",
    });
    expect(probe.reads).toBe(0);

    router.dispose();
  });

  it("⚑ a FORWARDING name is where it used to fail OPEN", async () => {
    // The sharpest cell: `forwardState` resolves a forwarding name to a plain
    // string, so the raw-value gate at the end never saw the object and the
    // navigation SUCCEEDED — to a route no read had authorised as existing.
    const probe = counting("fwd");
    const router = createRouter(ROUTES, {
      defaultRoute: probe.bag,
    } as never);

    await router.start("/start");

    await expect(router.navigateToDefault()).rejects.toMatchObject({
      code: "ROUTE_NOT_FOUND",
    });
    expect(probe.reads).toBe(0);

    router.dispose();
  });

  it("CONTROL — a plain string defaultRoute still navigates, callback included", async () => {
    const literal = createRouter(ROUTES, { defaultRoute: "home" });

    await literal.start("/start");

    await expect(literal.navigateToDefault()).resolves.toMatchObject({
      name: "home",
    });

    literal.dispose();

    // The callback form is re-evaluated per call by contract — two calls, two
    // answers — so the fix must not snapshot it at construction.
    let nth = 0;
    const viaCallback = createRouter(ROUTES, {
      defaultRoute: () => (nth++ === 0 ? "home" : "target"),
    });

    await viaCallback.start("/start");

    await expect(viaCallback.navigateToDefault()).resolves.toMatchObject({
      name: "home",
    });
    await expect(
      viaCallback.navigateToDefault({ force: true }),
    ).resolves.toMatchObject({ name: "target" });

    viaCallback.dispose();
  });
});
