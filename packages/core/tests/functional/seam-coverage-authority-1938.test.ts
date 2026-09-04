import { describe, expect, it } from "vitest";

import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

import type { Router } from "@real-router/core";
import type { PluginApi } from "@real-router/core/api";
import type { InterceptableMethodMap } from "@real-router/core/types";

/**
 * Which interceptor seam does each door run, and how many times?
 *
 * ⚑ **There is ONE injection seam, and this is the set of doors it covers.**
 * `forwardState` runs above the route-default merge, so what an interceptor
 * writes there becomes the canonical channel and reaches `state.search` and the
 * printed URL together. No seam sits below the merge any more (#1938), which is
 * what removes the shape where a plugin's two registrations answered
 * differently.
 *
 * ⚠ **This table counts seam RUNS; it does not see a seam's POSITION relative
 * to the merge.** Its fixtures declare no `defaultSearch` and register no
 * injector, so a seam moved from one side of the merge to the other would pass
 * every cell here. What discriminates position is
 * `href-equals-destination-with-plugin-2087` — the pair of doors answering one
 * intent with one URL.
 *
 * ⚠ **Two doors run NOTHING, and that is a statement, not a gap.**
 * `isActiveRoute` compares against a state it already holds; `makeState` is
 * `canonicalize`'s literal form, whose one production caller (`popstate-utils`)
 * hands it a path to restore rather than an intent to resolve. A plugin cannot
 * reach either, deliberately.
 *
 * ⚠ **A count of 0 is a broken PROBE until the door is shown to have run.**
 * `isActiveRoute` early-outs above `canonicalize` on a name it does not
 * recognise, and a probe that never reaches the door reports the same 0 as a
 * door that reaches no seam. Every row therefore asserts the door's ANSWER
 * beside its counts — the answer is the positive control, and it is what fails
 * if the fixture rots.
 *
 * ⚑ **Mutation-checked rather than assumed to guard something.** Un-wiring the
 * remaining seam — `port.resolveForward` reaching for the namespace primitive
 * instead of `ctx.forwardState` — reds the cells whose doors run it; the count
 * is asserted by the run, not restated here.
 *
 * ⚠ **The door set is LISTED, not derived, and the seam set IS derived.** A
 * seam invocation is a property of the call flow — `matchPath` reaches
 * `forwardState` through the port while printing its URL locally — so no scan
 * over `src` finds the pairs. The SEAM axis is different: `InterceptableMethodMap`
 * names the whole set, so `Counts` below is keyed by it and an interceptable
 * added to the type fails this file to compile rather than going unmeasured.
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
   * A router whose two seams count pass-through calls.
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
    const counts: Counts = { start: 0, forwardState: 0 };

    api.addInterceptor("start", (next, path) => {
      counts.start += 1;

      return next(path);
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
        counts.forwardState = 0;
      },
    };
  };

  const expected = (over: Partial<Counts>): Counts => ({
    start: 0,
    forwardState: 0,
    ...over,
  });

  it("start() commits through the URL→State door, so it never reaches the executor", async () => {
    const { router, counts } = instrument();

    const state = await router.start("/a");

    // Positive control: the door answered, so the counts describe a real run.
    expect(state.name).toBe("a");
    expect(counts).toStrictEqual(expected({ start: 1, forwardState: 1 }));
  });

  describe("after start", () => {
    const ready = async (): Promise<ReturnType<typeof instrument>> => {
      const rig = instrument();

      await rig.router.start("/");
      rig.reset();

      return rig;
    };

    it("router.buildPath — the href door — runs it once, on the INTENT", async () => {
      const { router, counts } = await ready();

      expect(router.buildPath("a", {}, { tab: "x" })).toBe("/a?tab=x");
      // ⚑ ONCE, and above the route-default merge (#2087) — the same side the
      // navigate door injects on, which is what makes the two agree on one URL.
      expect(counts).toStrictEqual(expected({ forwardState: 1 }));
    });

    it("router.buildPath on a forwardTo route stays literal, and still runs it", async () => {
      const { router, counts } = await ready();

      // A.5: the literal form answers about the route it was NAMED. The door's
      // `forwardState` terminal resolves nothing — that is the whole difference
      // from the navigate door's, which does.
      expect(router.buildPath("src")).toBe("/src");
      expect(counts).toStrictEqual(expected({ forwardState: 1 }));
    });

    it("router.navigate runs it once", async () => {
      const { router, counts } = await ready();

      const state = await router.navigate("a");

      expect(state.path).toBe("/a");
      expect(counts).toStrictEqual(expected({ forwardState: 1 }));
    });

    it("router.canNavigateTo runs it once", async () => {
      const { router, counts } = await ready();

      // Declared `boolean` and synchronous: the predicate answers on this
      // fixture without a guard to await.
      expect(router.canNavigateTo("a")).toBe(true);
      expect(counts).toStrictEqual(expected({ forwardState: 1 }));
    });

    it("PluginApi.buildNavigationState runs it once", async () => {
      const { api, counts } = await ready();

      expect(api.buildNavigationState("a", {}, {})?.name).toBe("a");
      expect(counts).toStrictEqual(expected({ forwardState: 1 }));
    });

    it("PluginApi.matchPath — the URL→State door — runs it once too", async () => {
      const { api, counts } = await ready();

      // It reaches the seam through the port while printing its URL locally,
      // which is why no scan over `src` finds this pair.
      expect(api.matchPath("/a")?.path).toBe("/a");
      expect(counts).toStrictEqual(expected({ forwardState: 1 }));
    });

    it("router.isActiveRoute runs NEITHER, on both of its arms", async () => {
      const { router, counts } = await ready();

      await router.navigate("p.c");
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

    it("PluginApi.makeState runs NOTHING when it has to print the path either", async () => {
      const { api, counts } = await ready();

      // ⚑ The row that MOVED when ⑤a was retired (#1938). Printing the path
      // itself used to reach the executor's chain, so this door was the one
      // place a plugin could act on `makeState` without being asked. It prints
      // through the engine now, and the two `makeState` rows agree.
      expect(
        (api.makeState as (name: string) => { path: string })("a").path,
      ).toBe("/a");
      expect(counts).toStrictEqual(expected({}));
    });
  });
});
