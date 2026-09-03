import { describe, expect, it } from "vitest";

import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

import type { Router } from "@real-router/core";
import type { PluginApi } from "@real-router/core/api";
import type { InterceptableMethodMap } from "@real-router/core/types";

/**
 * Which interceptor seam does each door run, and how many times?
 *
 * ⚑ **The two injection seams do not cover the same doors, and nothing else in
 * the suite says so.** `forwardState` runs above the route-default merge — what
 * an interceptor injects there becomes the canonical channel, so it reaches both
 * `state.search` and the printed URL. `buildPath` is the ⑤a executor, below the
 * merge — what an interceptor injects there reaches the URL alone. A plugin that
 * picks one seam gets one of two partial results, and the table below is what
 * makes that visible.
 *
 * ⚠ **This table counts seams; it does not see their POSITION relative to the
 * merge.** Its fixtures declare no `defaultSearch` and register no injector, so
 * the two sides of the merge answer identically here and a seam moved from one
 * to the other would pass every cell. What discriminates the position is
 * `href-equals-destination-with-plugin-2087` — the pair of doors answering one
 * intent with one URL — and that is where the claim above is proved rather than
 * restated.
 *
 * ⚠ **A count of 0 is a broken PROBE until the door is shown to have run.**
 * `isActiveRoute` early-outs above `canonicalize` on a name it does not
 * recognise, and a probe that never reaches the door reports the same 0 as a
 * door that reaches no seam. Every row therefore asserts the door's ANSWER
 * beside its counts — the answer is the positive control, and it is what fails
 * if the fixture rots.
 *
 * ⚑ **Mutation-checked rather than assumed to guard something.** Un-wiring ⑤a
 * from the interceptable — `port.buildPath` reaching for the engine's matcher
 * instead of `ctx.buildPath`, the one-line change the port's docblock calls a
 * behaviour change rather than a refactor — reds **6 of the 10** cells below.
 * The four that stay green are the ones whose doors touch neither seam or only
 * `forwardState`, which is the shape the mutation leaves alone.
 *
 * ⚠ **The door set is LISTED, not derived, and the seam set IS derived.** A
 * seam invocation is a property of the call flow — `matchPath` reaches
 * `forwardState` through the port while printing its URL locally — so no scan
 * over `src` finds the pairs. The SEAM axis is different: `InterceptableMethodMap`
 * names the whole set, so `Counts` below is keyed by it and a fourth
 * interceptable added to the type fails this file to compile rather than
 * going unmeasured.
 */
describe("which seam each door runs (#1938)", () => {
  /** Keyed by the map, so a new interceptable cannot be added unmeasured. */
  type Counts = Record<keyof InterceptableMethodMap, number>;

  const ROUTES = [
    { name: "home", path: "/" },
    { name: "a", path: "/a?tab" },
    { name: "p", path: "/p", children: [{ name: "c", path: "/c" }] },
    { name: "src", path: "/src", forwardTo: "a" },
  ];

  /**
   * A router whose three seams count pass-through calls.
   *
   * The counters are installed BEFORE `start()` so the `start` row measures the
   * same wiring as the rest; every other row resets the counts itself.
   */
  const instrument = (): {
    router: Router;
    api: PluginApi;
    counts: Counts;
    reset: () => void;
  } => {
    const router = createRouter(ROUTES as never);
    const api = getPluginApi(router);
    const counts: Counts = { start: 0, buildPath: 0, forwardState: 0 };

    api.addInterceptor("start", (next, path) => {
      counts.start += 1;

      return next(path);
    });
    api.addInterceptor("buildPath", (next, name, params, search) => {
      counts.buildPath += 1;

      return next(name, params, search);
    });
    api.addInterceptor("forwardState", (next, name, params, search) => {
      counts.forwardState += 1;

      return next(name, params, search);
    });

    return {
      router,
      api,
      counts,
      reset: () => {
        counts.start = 0;
        counts.buildPath = 0;
        counts.forwardState = 0;
      },
    };
  };

  const expected = (over: Partial<Counts>): Counts => ({
    start: 0,
    buildPath: 0,
    forwardState: 0,
    ...over,
  });

  it("start() commits through the URL→State door, so it never reaches the executor", async () => {
    const { router, counts } = instrument();

    const state = await router.start("/a");

    // Positive control: the door answered, so the counts describe a real run.
    expect(state.name).toBe("a");
    // ⚠ `buildPath: 0`, and it is not an oversight. `start` commits the initial
    // state through the same rebuild `matchPath` uses, which prints locally —
    // so the boot path carries a plugin's `forwardState` injection into the URL
    // and cannot carry a `buildPath` one at all.
    expect(counts).toStrictEqual(expected({ start: 1, forwardState: 1 }));
  });

  describe("after start", () => {
    const ready = async (): Promise<ReturnType<typeof instrument>> => {
      const rig = instrument();

      await rig.router.start("/");
      rig.reset();

      return rig;
    };

    it("router.buildPath — the href door — runs BOTH, forwardState first", async () => {
      const { router, counts } = await ready();

      expect(router.buildPath("a", {}, { tab: "x" })).toBe("/a?tab=x");
      // ⚑ `forwardState` on the INTENT, above the route-default merge, then
      // `buildPath` at ⑤a below it (#2087). One door, one intent, and the
      // injection now lands on the same side of the merge it lands on for
      // `navigate` — which is what makes the two agree.
      expect(counts).toStrictEqual(expected({ buildPath: 1, forwardState: 1 }));
    });

    it("router.buildPath on a forwardTo route stays literal, and still runs both", async () => {
      const { router, counts } = await ready();

      // A.5: the literal form answers about the route it was NAMED. The door's
      // `forwardState` terminal resolves nothing — that is the whole difference
      // from the navigate door's, which does.
      expect(router.buildPath("src")).toBe("/src");
      expect(counts).toStrictEqual(expected({ buildPath: 1, forwardState: 1 }));
    });

    it("router.navigate runs BOTH", async () => {
      const { router, counts } = await ready();

      const state = await router.navigate("a");

      expect(state.path).toBe("/a");
      expect(counts).toStrictEqual(expected({ buildPath: 1, forwardState: 1 }));
    });

    it("router.canNavigateTo runs BOTH", async () => {
      const { router, counts } = await ready();

      // Declared `boolean` and synchronous: the predicate answers on this
      // fixture without a guard to await.
      expect(router.canNavigateTo("a")).toBe(true);
      expect(counts).toStrictEqual(expected({ buildPath: 1, forwardState: 1 }));
    });

    it("PluginApi.buildNavigationState runs BOTH", async () => {
      const { api, counts } = await ready();

      expect(api.buildNavigationState("a", {}, {})?.name).toBe("a");
      expect(counts).toStrictEqual(expected({ buildPath: 1, forwardState: 1 }));
    });

    it("PluginApi.matchPath — the URL→State door — runs forwardState ALONE", async () => {
      const { api, counts } = await ready();

      // The rebuild prints through the engine, not through the executor, so the
      // mirror of `router.buildPath` above: one seam, the other one.
      expect(api.matchPath("/a")?.path).toBe("/a");
      expect(counts).toStrictEqual(expected({ forwardState: 1 }));
    });

    it("router.isActiveRoute runs NEITHER, on both of its arms", async () => {
      const { router, counts } = await ready();

      await router.navigate("p.c");
      counts.buildPath = 0;
      counts.forwardState = 0;
      counts.start = 0;

      // Exact arm and parent arm: both answer, and neither reaches a seam.
      expect(router.isActiveRoute("p.c")).toBe(true);
      expect(router.isActiveRoute("p")).toBe(true);
      expect(counts).toStrictEqual(expected({}));
    });

    it("PluginApi.makeState runs NEITHER when the caller supplies the path", async () => {
      const { api, counts } = await ready();

      expect(api.makeState("a", {}, {}, "/a").path).toBe("/a");
      expect(counts).toStrictEqual(expected({}));
    });

    it("PluginApi.makeState runs buildPath ALONE when it has to print the path", async () => {
      const { api, counts } = await ready();

      // ⑤a is reached only because the caller named no path — the same door,
      // one argument apart, moves from the previous row to this one.
      expect(
        (api.makeState as (name: string) => { path: string })("a").path,
      ).toBe("/a");
      expect(counts).toStrictEqual(expected({ buildPath: 1 }));
    });
  });
});
