import { describe, expect, it } from "vitest";

import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

import type { Params, SearchParams } from "@real-router/core";

/**
 * `undefined` ≡ absence, on BOTH sides of the default merge (#1550 / #1551).
 *
 * The path channel already behaved this way by accident — `normalizeParams`
 * strips the caller's `undefined`s before `makeState` merges the route default —
 * while the query channel had no such step, and NEITHER channel looked at the
 * DEFAULT side. So:
 *
 * - #1550: `navigate("x", {}, { page: undefined })` killed `defaultSearch` and
 *   left an own `page: undefined` key in the frozen `state.search`;
 * - #1551: a default that itself carries `undefined`
 *   (`defaultSearch: { q: undefined }` / `defaultParams: { extra: undefined }`)
 *   leaked that own key into the committed state through every producer.
 *
 * The rule now lives in the merge itself (`mergeDefined`, `src/helpers.ts`), so
 * it holds for every entry point and for a default and a caller value alike: a
 * key whose winning value is `undefined` simply does not exist.
 */
describe("core/state — undefined is absence in the default merge (#1550, #1551)", () => {
  const ROUTES = [
    { name: "home", path: "/home" },
    { name: "x", path: "/x?page", defaultSearch: { page: "1" } },
    { name: "plain", path: "/plain?zzz" },
    {
      name: "q",
      path: "/q?q",
      defaultSearch: { q: undefined } as SearchParams,
    },
    {
      name: "arb",
      path: "/arb",
      defaultParams: { extra: undefined } as Params,
    },
    {
      name: "req",
      path: "/req/:id",
      defaultParams: { id: undefined } as Params,
    },
    { name: "y", path: "/y/:id", defaultParams: { id: "7" } },
  ];

  const started = async () => {
    const router = createRouter(ROUTES);

    await router.start("/home");

    return router;
  };

  describe("caller side: an explicit undefined does not outrank the default (#1550)", () => {
    it("keeps defaultSearch when the query value is explicitly undefined", async () => {
      const router = await started();

      const state = await router.navigate("x", {}, { page: undefined });

      // Symmetric with the path channel, which already behaves this way.
      expect(state.search).toStrictEqual({ page: "1" });
      expect(state.path).toBe("/x?page=1");
    });

    it("keeps defaultParams when the path value is explicitly undefined (unchanged)", async () => {
      const router = await started();

      const state = await router.navigate("y", { id: undefined });

      expect(state.params).toStrictEqual({ id: "7" });
      expect(state.path).toBe("/y/7");
    });

    it("drops an explicitly-undefined query value when the route has no default", async () => {
      const router = await started();

      const state = await router.navigate("plain", {}, { zzz: undefined });

      expect(Object.hasOwn(state.search, "zzz")).toBe(false);
      expect(state.path).toBe("/plain");
    });
  });

  describe("default side: an undefined-valued default behaves like no entry (#1551)", () => {
    it("does not leak the key into state.search on navigate", async () => {
      const router = await started();

      const state = await router.navigate("q", {});

      expect(Object.hasOwn(state.search, "q")).toBe(false);
    });

    it("does not leak the key into state.search on the URL direction", async () => {
      const router = await started();

      const matched = getPluginApi(router).matchPath("/q");

      expect(matched).toBeDefined();
      expect(Object.hasOwn(matched!.search, "q")).toBe(false);
    });

    it("does not leak an arbitrary undefined default into state.params", async () => {
      const router = await started();

      const state = await router.navigate("arb");

      expect(Object.hasOwn(state.params, "extra")).toBe(false);
      expect(state.path).toBe("/arb");
    });

    it("does not leak through the makeState primitive", async () => {
      const router = await started();
      const api = getPluginApi(router);

      expect(Object.hasOwn(api.makeState("arb").params, "extra")).toBe(false);
      expect(Object.hasOwn(api.makeState("q").search, "q")).toBe(false);
    });

    it("keeps a caller value that shadows an undefined default", async () => {
      const router = await started();

      const state = await router.navigate("req", { id: "3" });

      expect(state.params).toStrictEqual({ id: "3" });
      expect(state.path).toBe("/req/3");
    });

    it("still reports a genuinely missing required param", async () => {
      const router = await started();

      // The default carries no value, so `id` really is absent — same error as
      // with no `defaultParams` entry at all, for the right reason.
      await expect(router.navigate("req")).rejects.toThrow(
        /Missing required param 'id'/,
      );
    });
  });

  describe("only own keys participate in the merge", () => {
    // Mirrors the `normalizeParams` contract ("ignores inherited (prototype-chain)
    // properties") on both sides of the merge — a prototype-borne key must not
    // reach the state, whether it rides on the caller bag or on the route default.
    const PROTO = { inherited: "INHERITED" };

    it("ignores an inherited key on the caller bag", async () => {
      const router = await started();
      const params = Object.create(PROTO) as Params;

      params.own = "own-value";

      expect(
        getPluginApi(router).makeState("arb", params).params,
      ).toStrictEqual({ own: "own-value" });

      const navigated = await router.navigate("arb", params);

      expect(navigated.params).toStrictEqual({ own: "own-value" });
    });

    it("ignores an inherited key on the caller's SEARCH bag", async () => {
      // The PATH channel is filtered twice — `normalizeParams` runs before the
      // merge for every producer since `makeState` joined the pipeline (Phase 4),
      // so the merge's own-key guard never sees an inherited path key any more.
      // The QUERY channel has no such entry guard: `canonicalize` hands the
      // caller's `search` to the merge verbatim, which makes the guard inside
      // `mergeDefined` the ONLY thing standing between a prototype-borne key and
      // `state.search`. Coverage pointed at that line the moment the path
      // channel stopped reaching it.
      //
      // Route `x` and not `arb`: `mergeDefined` short-circuits to
      // `stripUndefined(value)` when the route has NO default in that channel,
      // so only a route WITH a `defaultSearch` runs the merge loop the guard
      // lives in. Picking the wrong fixture here passes while testing nothing.
      const router = await started();
      const search = Object.create({ inheritedQ: "INHERITED" }) as SearchParams;

      search.ownQ = "own-value";

      expect(
        getPluginApi(router).makeState("x", {}, search).search,
      ).toStrictEqual({ page: "1", ownQ: "own-value" });

      const navigated = await router.navigate("x", {}, search);

      expect(navigated.search).toStrictEqual({ page: "1", ownQ: "own-value" });
    });

    it("ignores an inherited key on the route default", async () => {
      const defaultParams = Object.create(PROTO) as Params;

      defaultParams.own = "from-default";

      const router = createRouter([
        { name: "home", path: "/home" },
        { name: "proto", path: "/proto", defaultParams },
      ]);

      await router.start("/home");

      const state = await router.navigate("proto");

      expect(state.params).toStrictEqual({ own: "from-default" });
    });
  });

  describe("the rule holds on the sites that feed the URL and the plugins", () => {
    it("hides an undefined source default from the forwardState primitive", async () => {
      const router = createRouter([
        { name: "home", path: "/home" },
        {
          name: "src",
          path: "/src",
          forwardTo: "dst",
          defaultParams: { z: undefined },
        },
        { name: "dst", path: "/dst" },
      ]);

      await router.start("/home");

      const forwarded = getPluginApi(router).forwardState("src", {});

      expect(forwarded.name).toBe("dst");
      expect(Object.hasOwn(forwarded.params, "z")).toBe(false);
    });

    it("hides undefined defaults from a route codec", async () => {
      const seen: { params: Params; search: SearchParams }[] = [];
      const router = createRouter([
        { name: "home", path: "/home" },
        {
          name: "c",
          path: "/c/:id?opt",
          defaultParams: { extra: undefined },
          defaultSearch: { opt: undefined },
          encodeParams: (channels) => {
            seen.push(channels);

            return channels;
          },
        },
      ]);

      await router.start("/home");
      router.buildPath("c", { id: "1" });

      expect(seen).toHaveLength(1);
      expect(Object.hasOwn(seen[0].params, "extra")).toBe(false);
      expect(Object.hasOwn(seen[0].search, "opt")).toBe(false);
    });
  });
});
