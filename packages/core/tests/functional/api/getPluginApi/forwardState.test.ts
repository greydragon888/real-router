import { describe, beforeEach, afterEach, it, expect } from "vitest";

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

  describe("chain defaults land in the channel the TARGET declares (#1570)", () => {
    /**
     * A forwarding hop can only declare a default in `defaultParams` — that is
     * the single slot it has. But the CHANNEL is decided by the resolved
     * TARGET: if the target declares that key with `?`, the value belongs in
     * the query channel.
     *
     * Asserted on the RAW stage-① output, which is what a `forwardState`
     * interceptor sees: `next(...)` returns the namespace primitive's result,
     * before the seam's `separateChannels` runs. That is the surface the
     * producer contract (RFC §4.3) is about — `search-schema` and friends read
     * these bags — and the only place the classification is observable, since
     * the seam moves the key one line later and the committed state is
     * therefore identical either way.
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

    it("routes a chain default into `search` when the target declares it as a query param", async () => {
      routesApi.add([
        { name: "q-dst", path: "/q-dst?lang" },
        {
          name: "q-src",
          path: "/q-src",
          forwardTo: "q-dst",
          defaultParams: { lang: "fr" },
        },
      ]);

      const stageOne = captureStageOne();

      await router.navigate("q-src", {}, undefined, { reload: true });

      expect(stageOne.calls.at(-1)?.search).toStrictEqual({ lang: "fr" });
      expect(stageOne.calls.at(-1)?.params).toStrictEqual({});
    });

    it("keeps a chain default in `params` when the target declares it as a path slot", async () => {
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

      await router.navigate("p-src", {}, undefined, { reload: true });

      // The discriminator: the split is by DECLARATION, not a blanket move.
      expect(stageOne.calls.at(-1)?.params).toStrictEqual({ lang: "es" });
      expect(stageOne.calls.at(-1)?.search).toStrictEqual({});
    });

    it("splits an INTERMEDIATE hop's default of a multi-hop chain", async () => {
      routesApi.add([
        { name: "h-dst", path: "/h-dst?lang" },
        {
          name: "h-mid",
          path: "/h-mid",
          forwardTo: "h-dst",
          defaultParams: { lang: "de" },
        },
        { name: "h-src", path: "/h-src", forwardTo: "h-mid" },
      ]);

      const stageOne = captureStageOne();

      await router.navigate("h-src", {}, undefined, { reload: true });

      expect(stageOne.calls.at(-1)?.search).toStrictEqual({ lang: "de" });
      expect(stageOne.calls.at(-1)?.params).toStrictEqual({});
    });

    it("splits a DYNAMIC chain's hop default", async () => {
      routesApi.add([
        { name: "d-dst", path: "/d-dst?lang" },
        {
          name: "d-src",
          path: "/d-src",
          forwardTo: () => "d-dst",
          defaultParams: { lang: "it" },
        },
      ]);

      const stageOne = captureStageOne();

      await router.navigate("d-src", {}, undefined, { reload: true });

      expect(stageOne.calls.at(-1)?.search).toStrictEqual({ lang: "it" });
      expect(stageOne.calls.at(-1)?.params).toStrictEqual({});
    });

    it("splits a MIXED static→dynamic chain's hop default", async () => {
      routesApi.add([
        { name: "mx-dst", path: "/mx-dst?lang" },
        {
          name: "mx-mid",
          path: "/mx-mid",
          forwardTo: () => "mx-dst",
          defaultParams: { lang: "pt" },
        },
        { name: "mx-src", path: "/mx-src", forwardTo: "mx-mid" },
      ]);

      const stageOne = captureStageOne();

      await router.navigate("mx-src", {}, undefined, { reload: true });

      // The third branch: a static prefix concatenated with a dynamic walk.
      expect(stageOne.calls.at(-1)?.search).toStrictEqual({ lang: "pt" });
      expect(stageOne.calls.at(-1)?.params).toStrictEqual({});
    });

    it("keeps a colliding name path-owned when the target declares both slots", async () => {
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

      // `/c-dst/:id?id` — the name occupies a path slot, so it is path-owned
      // (#843 / #1549 carve-out) and `getQueryParams` excludes it. The split
      // must inherit that carve-out rather than re-derive its own rule.
      expect(stageOne.calls.at(-1)?.params).toStrictEqual({ id: "X" });
      expect(stageOne.calls.at(-1)?.search).toStrictEqual({});
    });

    it("lets the caller beat the layered default in BOTH channels", async () => {
      routesApi.add([
        { name: "w-dst", path: "/w-dst/:slot?lang" },
        {
          name: "w-src",
          path: "/w-src",
          forwardTo: "w-dst",
          defaultParams: { lang: "fr", slot: "DEFAULT" },
        },
      ]);

      const stageOne = captureStageOne();

      await router.navigate(
        "w-src",
        { slot: "CALLER" },
        { lang: "en" },
        { reload: true },
      );

      expect(stageOne.calls.at(-1)?.search).toStrictEqual({ lang: "en" });
      expect(stageOne.calls.at(-1)?.params).toStrictEqual({ slot: "CALLER" });
    });
  });
});
