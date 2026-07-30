import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { createRouter } from "@real-router/core";
import { getPluginApi, getRoutesApi } from "@real-router/core/api";

import { createTestRouter } from "../../../helpers";

import type { Params, Router, SearchParams } from "@real-router/core";
import type { RoutesApi } from "@real-router/core/api";

let router: Router;
let routesApi: RoutesApi;

describe("forwardState", () => {
  beforeEach(async () => {
    router = createTestRouter();
    routesApi = getRoutesApi(router);
    await router.start("/home");
  });

  afterEach(() => {
    router.stop();
  });

  it("returns same state if no forward defined", () => {
    const state = getPluginApi(router).forwardState("home", { id: 1 });

    expect(state.name).toBe("home");
    expect(state.params.id).toBe(1);
  });

  it("forwards to another route, layering source defaults (target defaults are terminal)", async () => {
    // Add routes with defaultParams
    routesApi.add([
      { name: "srcRoute", path: "/src", defaultParams: { a: 1 } },
      { name: "dstRoute", path: "/dst", defaultParams: { b: 2 } },
    ]);
    routesApi.update("srcRoute", { forwardTo: "dstRoute" });

    // forwardState resolves the forward and layers the SOURCE route's defaults
    // (a:1) — a forwardTo-specific merge the terminal builders cannot reconstruct
    // (they see only the resolved target). The TARGET's defaults (b:2) are NOT
    // merged here; they are applied downstream by makeState (#1549).
    const forwarded = getPluginApi(router).forwardState("srcRoute", { c: 3 });

    expect(forwarded.name).toBe("dstRoute");
    expect(forwarded.params).toStrictEqual({ a: 1, c: 3 });

    // The committed state (navigate → makeState) carries the target default too.
    const state = await router.navigate("srcRoute", { c: 3 });

    expect(state.name).toBe("dstRoute");
    expect(state.params).toStrictEqual({ a: 1, b: 2, c: 3 });
  });

  it("forwards with only source route defaults (line 595)", () => {
    // Add routes: source has defaults, target doesn't
    routesApi.add([
      {
        name: "srcWithDefaults",
        path: "/src-with-defaults",
        defaultParams: { a: 1 },
      },
      { name: "dstNoDefaults", path: "/dst-no-defaults" },
    ]);
    routesApi.update("srcWithDefaults", {
      forwardTo: "dstNoDefaults",
    });

    const state = getPluginApi(router).forwardState("srcWithDefaults", {
      c: 3,
    });

    expect(state.name).toBe("dstNoDefaults");
    expect(state.params).toStrictEqual({ a: 1, c: 3 });
  });

  it("forwards with only target route defaults — applied by the state builder, not forwardState (line 598)", async () => {
    // Add routes: source has no defaults, target has defaults
    routesApi.add([
      { name: "srcNoDefaults", path: "/src-no-defaults" },
      {
        name: "dstWithDefaults",
        path: "/dst-with-defaults",
        defaultParams: { b: 2 },
      },
    ]);
    routesApi.update("srcNoDefaults", {
      forwardTo: "dstWithDefaults",
    });

    // Source has no defaults; forwardState returns the user params only — the
    // TARGET's b:2 is NOT merged here (terminal now, #1549).
    const forwarded = getPluginApi(router).forwardState("srcNoDefaults", {
      c: 3,
    });

    expect(forwarded.name).toBe("dstWithDefaults");
    expect(forwarded.params).toStrictEqual({ c: 3 });

    // The committed state (navigate → makeState) applies the target default.
    const state = await router.navigate("srcNoDefaults", { c: 3 });

    expect(state.name).toBe("dstWithDefaults");
    expect(state.params).toStrictEqual({ b: 2, c: 3 });
  });

  describe("multi-hop chains layer every forwarding hop's defaults (#1566)", () => {
    it("layers an INTERMEDIATE hop's defaults, not only the entered route's", async () => {
      routesApi.add([
        { name: "m1", path: "/m1", forwardTo: "m2" },
        {
          name: "m2",
          path: "/m2",
          forwardTo: "m3",
          defaultParams: { p: "P2" },
        },
        { name: "m3", path: "/m3/:p" },
      ]);

      expect(getPluginApi(router).forwardState("m1", {}).params).toStrictEqual({
        p: "P2",
      });

      const state = await router.navigate("m1");

      expect(state.path).toBe("/m3/P2");
    });

    it("lets an EARLIER hop win over a later one, and the caller over both", async () => {
      routesApi.add([
        {
          name: "e1",
          path: "/e1",
          forwardTo: "e2",
          defaultParams: { p: "P1" },
        },
        {
          name: "e2",
          path: "/e2",
          forwardTo: "e3",
          defaultParams: { p: "P2" },
        },
        { name: "e3", path: "/e3/:p" },
      ]);

      const earliest = await router.navigate("e1");

      expect(earliest.path).toBe("/e3/P1");

      const explicit = await router.navigate("e1", { p: "CALL" });

      expect(explicit.path).toBe("/e3/CALL");
    });

    it("layers hops of a DYNAMIC chain", async () => {
      routesApi.add([
        { name: "d1", path: "/d1", forwardTo: () => "d2" },
        {
          name: "d2",
          path: "/d2",
          forwardTo: () => "d3",
          defaultParams: { p: "DP2" },
        },
        { name: "d3", path: "/d3/:p" },
      ]);

      const state = await router.navigate("d1");

      expect(state.path).toBe("/d3/DP2");
    });

    it("layers hops of a MIXED static→dynamic chain", async () => {
      routesApi.add([
        { name: "x1", path: "/x1", forwardTo: "x2" },
        {
          name: "x2",
          path: "/x2",
          forwardTo: () => "x3",
          defaultParams: { p: "XP2" },
        },
        { name: "x3", path: "/x3/:p" },
      ]);

      const state = await router.navigate("x1");

      expect(state.path).toBe("/x3/XP2");
    });

    it("still leaves the TARGET's own defaults to the state builder", () => {
      routesApi.add([
        { name: "t1", path: "/t1", forwardTo: "t2" },
        { name: "t2", path: "/t2", forwardTo: "t3" },
        { name: "t3", path: "/t3/:p", defaultParams: { p: "P3" } },
      ]);

      // No forwarding hop declares `p`, so forwardState must not invent it —
      // the terminal default is merged downstream (#1549).
      expect(getPluginApi(router).forwardState("t1", {}).params).toStrictEqual(
        {},
      );
    });
  });

  describe("a forwarding hop's defaults keep the channel they were spelled in", () => {
    /**
     * A hop writes `defaultParams` for the path channel and `defaultSearch` for
     * the query channel, and the router moves neither. The channel used to be
     * decided by the resolved TARGET's declaration (#1570), on the argument
     * that a hop "can only spell a default in `defaultParams`" — which was
     * already false (the fold reads `defaultSearch` too) and left a hop author
     * unable to tell which channel their own config would land in without
     * reading a target that a `forwardTo` CALLBACK may not determine until
     * navigation time.
     *
     * Asserted on the RAW stage-① output, which is what a `forwardState`
     * interceptor sees: `next(...)` returns the namespace primitive's result.
     * That is the surface the producer contract (RFC §4.3) is about — plugins
     * read these bags — and now also the surface the seam CHECKS.
     */
    function captureStageOne(): {
      calls: { params: Params; search: SearchParams }[];
    } {
      const captured: { params: Params; search: SearchParams }[] = [];

      getPluginApi(router).addInterceptor(
        "forwardState",
        (next, name, params, search) => {
          const raw = next(name, params, search);

          captured.push({ params: raw.params, search: raw.search });

          return raw;
        },
      );

      return { calls: captured };
    }

    it("layers a hop's defaultSearch into the query channel", async () => {
      routesApi.add([
        { name: "q-dst", path: "/q-dst?lang" },
        {
          name: "q-src",
          path: "/q-src",
          forwardTo: "q-dst",
          defaultSearch: { lang: "fr" },
        },
      ]);

      const stageOne = captureStageOne();
      const state = await router.navigate("q-src", {}, undefined, {
        reload: true,
      });

      expect(stageOne.calls.at(-1)?.search).toStrictEqual({ lang: "fr" });
      expect(stageOne.calls.at(-1)?.params).toStrictEqual({});
      expect(state.path).toBe("/q-dst?lang=fr");
    });

    it("keeps a hop's defaultParams in the path channel", async () => {
      routesApi.add([
        { name: "p-dst", path: "/p-dst/:lang" },
        {
          name: "p-src",
          path: "/p-src",
          forwardTo: "p-dst",
          defaultParams: { lang: "es" },
        },
      ]);

      const stageOne = captureStageOne();
      const state = await router.navigate("p-src", {}, undefined, {
        reload: true,
      });

      expect(stageOne.calls.at(-1)?.params).toStrictEqual({ lang: "es" });
      expect(stageOne.calls.at(-1)?.search).toStrictEqual({});
      expect(state.path).toBe("/p-dst/es");
    });

    it("refuses a hop's defaultParams the TARGET declares as a query param", async () => {
      // Registration cannot catch this one: the hop's own declarations are
      // clean, and only the resolved target says `?lang`. So the check lives at
      // the seam, where the target is finally known — and the message names
      // both routes, because the author looked at neither in isolation.
      routesApi.add([
        { name: "m-dst", path: "/m-dst?lang" },
        {
          name: "m-src",
          path: "/m-src",
          forwardTo: "m-dst",
          defaultParams: { lang: "fr" },
        },
      ]);

      await expect(
        router.navigate("m-src", {}, undefined, { reload: true }),
      ).rejects.toThrow(/"m-dst" declares `lang`[\s\S]*from "m-src"/);
    });

    it("layers an INTERMEDIATE hop's defaults across a multi-hop chain", async () => {
      routesApi.add([
        { name: "i3", path: "/i3?lang" },
        {
          name: "i2",
          path: "/i2",
          forwardTo: "i3",
          defaultSearch: { lang: "fr" },
        },
        { name: "i1", path: "/i1", forwardTo: "i2" },
      ]);

      const stageOne = captureStageOne();

      await router.navigate("i1", {}, undefined, { reload: true });

      // The hop that spelled the default is not the one entered NOR the target.
      expect(stageOne.calls.at(-1)?.search).toStrictEqual({ lang: "fr" });
      expect(stageOne.calls.at(-1)?.params).toStrictEqual({});
    });

    it("layers a DYNAMIC chain's hop defaults", async () => {
      // The case that decides where the check belongs: the target comes from a
      // callback, so no registration-time pass can know it. The hop's own slot
      // still says which channel it meant.
      routesApi.add([
        { name: "d-dst", path: "/d-dst?lang" },
        {
          name: "d-src",
          path: "/d-src",
          forwardTo: () => "d-dst",
          defaultSearch: { lang: "fr" },
        },
      ]);

      const stageOne = captureStageOne();

      await router.navigate("d-src", {}, undefined, { reload: true });

      expect(stageOne.calls.at(-1)?.search).toStrictEqual({ lang: "fr" });
      expect(stageOne.calls.at(-1)?.params).toStrictEqual({});
    });

    it("layers a MIXED static→dynamic chain's hop defaults", async () => {
      routesApi.add([
        { name: "x3", path: "/x3?lang" },
        {
          name: "x2",
          path: "/x2",
          forwardTo: () => "x3",
          defaultSearch: { lang: "fr" },
        },
        { name: "x1", path: "/x1", forwardTo: "x2" },
      ]);

      const stageOne = captureStageOne();

      await router.navigate("x1", {}, undefined, { reload: true });

      expect(stageOne.calls.at(-1)?.search).toStrictEqual({ lang: "fr" });
      expect(stageOne.calls.at(-1)?.params).toStrictEqual({});
    });

    it("keeps a colliding name path-owned when the target declares both slots", async () => {
      // `/c-dst/:id?id` — the name occupies a path slot, so it is path-owned
      // (#843 / #1549 carve-out) and `getQueryParams` excludes it. The seam's
      // check inherits that carve-out rather than re-deriving its own rule, so
      // a `defaultParams` for it is legal.
      routesApi.add([
        { name: "c-dst", path: "/c-dst/:id?id" },
        {
          name: "c-src",
          path: "/c-src",
          forwardTo: "c-dst",
          defaultParams: { id: "X" },
        },
      ]);

      const stageOne = captureStageOne();

      await router.navigate("c-src", {}, undefined, { reload: true });

      expect(stageOne.calls.at(-1)?.params).toStrictEqual({ id: "X" });
      expect(stageOne.calls.at(-1)?.search).toStrictEqual({});
    });

    it("lets a caller's QUERY value beat a chain default", async () => {
      routesApi.add([
        { name: "b-dst", path: "/b-dst?lang" },
        {
          name: "b-src",
          path: "/b-src",
          forwardTo: "b-dst",
          defaultSearch: { lang: "fr" },
        },
      ]);

      const state = await router.navigate(
        "b-src",
        {},
        { lang: "de" },
        {
          reload: true,
        },
      );

      expect(state.search).toStrictEqual({ lang: "de" });
      expect(state.path).toBe("/b-dst?lang=de");
    });

    it("lets a caller's QUERY value beat a MID-CHAIN default across hops", async () => {
      routesApi.add([
        { name: "j3", path: "/j3?lang" },
        {
          name: "j2",
          path: "/j2",
          forwardTo: "j3",
          defaultSearch: { lang: "fr" },
        },
        { name: "j1", path: "/j1", forwardTo: "j2" },
      ]);

      const state = await router.navigate(
        "j1",
        {},
        { lang: "de" },
        {
          reload: true,
        },
      );

      expect(state.search).toStrictEqual({ lang: "de" });
      expect(state.path).toBe("/j3?lang=de");
    });

    it("lets a caller beat a hop's defaults in BOTH channels at once", async () => {
      routesApi.add([
        { name: "x-dst", path: "/x-dst/:z?lang" },
        {
          name: "x-src",
          path: "/x-src",
          forwardTo: "x-dst",
          defaultParams: { z: "5" },
          defaultSearch: { lang: "fr" },
        },
      ]);

      const state = await router.navigate(
        "x-src",
        { z: "9" },
        { lang: "de" },
        { reload: true },
      );

      expect(state.params).toStrictEqual({ z: "9" });
      expect(state.search).toStrictEqual({ lang: "de" });
      expect(state.path).toBe("/x-dst/9?lang=de");
    });

    it("keeps a chain default alive against an explicit `undefined` in EITHER bag", async () => {
      routesApi.add([
        { name: "u-dst", path: "/u-dst/:z?lang" },
        {
          name: "u-src",
          path: "/u-src",
          forwardTo: "u-dst",
          defaultParams: { z: "5" },
          defaultSearch: { lang: "fr" },
        },
      ]);

      // `undefined` is ABSENCE on both sides of the merge (#1550 / #1551), so it
      // means "I said nothing" and the default keeps the slot — in each channel
      // independently.
      const state = await router.navigate(
        "u-src",
        { z: undefined },
        { lang: undefined },
        { reload: true },
      );

      expect(state.params).toStrictEqual({ z: "5" });
      expect(state.search).toStrictEqual({ lang: "fr" });
      expect(state.path).toBe("/u-dst/5?lang=fr");
    });
  });

  describe("primitive contracts (nav-pipeline Phase 2, step 2-6)", () => {
    it("forwardState is stage ① ALONE — it does not apply the target's own defaults", () => {
      const router = createRouter([
        { name: "src", path: "/src", forwardTo: "dst" },
        { name: "dst", path: "/dst?tab", defaultSearch: { tab: "new" } },
      ]);

      // ① resolves the chain; ③ (the TERMINAL route's own defaults) is the
      // caller's job. A producer that needs the whole intent runs both through
      // `canonicalize`; one that needs only the resolved identity does not pay
      // for the merge.
      expect(getPluginApi(router).forwardState("src", {})).toStrictEqual({
        name: "dst",
        params: {},
        search: {},
      });
    });

    it("makeState is the LITERAL form — it never resolves forwardTo", () => {
      const router = createRouter([
        { name: "src", path: "/src", forwardTo: "dst" },
        { name: "dst", path: "/dst" },
      ]);

      const state = getPluginApi(router).makeState("src");

      // Equivalent to `canonicalize(..., { resolveForward: false })` — the same
      // form buildPath and isActiveRoute take. A plugin can build a state for an
      // alias without being teleported off it.
      expect(state.name).toBe("src");
      expect(state.path).toBe("/src");
    });

    it("makeState still applies stage ③ of the route it was NAMED", () => {
      const router = createRouter([
        { name: "x", path: "/x?page", defaultSearch: { page: "5" } },
      ]);

      const state = getPluginApi(router).makeState("x");

      // Literal about the NAME, not about the defaults: skipping ① does not skip
      // ③. This is the pair that makes the contract discriminating — without it
      // "literal" could be read as "no merging at all".
      expect(state.search).toStrictEqual({ page: "5" });
      expect(state.path).toBe("/x?page=5");
    });

    it("normalises a params bag an interceptor dropped to `undefined`", async () => {
      // The seam's `?? EMPTY_PARAMS`. It used to be reached by stage ②, whose
      // split returned an undefined path bag when every key belonged to the
      // query channel; with the repair gone, the only remaining source is an
      // interceptor breaking its own typed contract (`params: P`, not `P |
      // undefined`). That is still worth surviving — a third-party interceptor
      // spreading a partial result must not put `undefined` into `state.params`
      // and crash every consumer downstream — so the net is pinned rather than
      // deleted along with the mechanism that used to exercise it.
      const router = createRouter([{ name: "a", path: "/a/:id" }], {
        defaultRoute: "a",
      });
      const api = getPluginApi(router);

      api.addInterceptor("forwardState", (next, name, params) => {
        const result = next(name, params);

        return { ...result, params: undefined as never };
      });

      await router.start("/a/1");

      expect(router.getState()?.params).toStrictEqual({});
      expect(router.getState()?.path).toBe("/a/1");

      router.stop();
    });
  });
});
