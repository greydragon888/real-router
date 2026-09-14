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
    // gate into the `!route` one — and inheriting its "empty name" message, the
    // reuse this fix explicitly rejects — passes the whole package without it.
    //
    // ⚠ The reason lives in `message` since #1785 — `routeName` is for a route a
    // consumer could retry, and these branches name none, so the field is absent
    // rather than holding prose. That absence is asserted over every producer at
    // once in `navigate/error-context.test.ts`; repeating it here would pin the
    // same fact in two places. Matched by FRAGMENT so rephrasing a sentence is
    // not a test edit — what is pinned is that the three branches stay
    // distinguishable from each other.
    await expect(router.navigateToDefault()).rejects.toMatchObject({
      code: "ROUTE_NOT_FOUND",
      message: expect.stringContaining("cannot name a route"),
    });
    expect(probe.reads).toBe(0);

    await expect(router.navigateToDefault()).rejects.toMatchObject({
      code: "ROUTE_NOT_FOUND",
    });
    expect(probe.reads).toBe(0);

    router.dispose();
  });

  it("a FORWARDING name used to fail OPEN — now zero reads, and it refuses", async () => {
    // ⚑ The rejection alone does NOT pin this gate: with it deleted, the
    // `forwardState` gate shipped alongside still refuses, so the promise still
    // rejects. The fail-OPEN only reappears when BOTH are gone. What this cell
    // discriminates on its own is the read count.
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

  it("an any-typed CALLBACK returning a non-string is refused, and never read", async () => {
    // ⚑ THE hole the production comment names first — and nothing covered it.
    // Measured: narrowing the gate to the static option form
    // (`typeof options.defaultRoute !== "function" && typeof route !== "string"`)
    // passes the ENTIRE package — every test green, 100% on all four metrics —
    // while reinstating the defect for exactly this caller. The callback's
    // return is type-checked (`() => 42` is TS2322), so the way in is an
    // `any`-typed callback, a JavaScript consumer, or a config assembled at
    // runtime.
    const probe = counting("target");
    const router = createRouter(ROUTES, {
      defaultRoute: (() => probe.bag) as never,
    });

    await router.start("/start");

    await expect(router.navigateToDefault()).rejects.toMatchObject({
      code: "ROUTE_NOT_FOUND",
      message: expect.stringContaining("cannot name a route"),
    });
    // The named reason matters here for the same reason as in the static cell:
    // a gate that only covers the option form loses it and reports `undefined`.
    expect(probe.reads).toBe(0);

    router.dispose();
  });

  it("a FALSY non-string keeps the empty-gate's reason — the new gate sits below it", async () => {
    // ⚑ Placement, and nothing else pinned it: hoisting the new gate above the
    // `if (!route)` refusal passes the core suite while silently relabelling
    // every falsy resolution. `0`, `null` and `NaN` are non-strings AND empty,
    // so which of the two refusals claims them is decided purely by order — and
    // the sibling cell above argues at length that the reason string is what a
    // caller reads.
    for (const falsy of [0, null, Number.NaN] as const) {
      const router = createRouter(ROUTES, {
        defaultRoute: (() => falsy) as never,
      });

      await router.start("/start");

      await expect(router.navigateToDefault()).rejects.toMatchObject({
        code: "ROUTE_NOT_FOUND",
        message: expect.stringContaining("resolved to an empty name"),
      });

      router.dispose();
    }
  });

  it("a defaultRoute whose toString THROWS does not throw at construction", async () => {
    // ⚑ #1876 asked for this cell by name, after an earlier revision claimed
    // `options.test.ts` already pinned it — it does not, and did not. It is
    // worth more now than when it was asked for: the gate is what guarantees
    // the `toString` is never reached, so this pins the gate's reach as much as
    // the constructor's tolerance.
    const hostile = {
      toString: () => {
        throw new Error("BOOM");
      },
    };

    const router = createRouter(ROUTES, { defaultRoute: hostile } as never);

    // Construction and start are both unaffected — the option is not consulted.
    await expect(router.start("/start")).resolves.toMatchObject({
      name: "start",
    });
    // And the refusal arrives without ever invoking the hostile `toString`,
    // which is why the caller sees ROUTE_NOT_FOUND rather than "BOOM".
    await expect(router.navigateToDefault()).rejects.toMatchObject({
      code: "ROUTE_NOT_FOUND",
      message: expect.stringContaining("cannot name a route"),
    });

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
