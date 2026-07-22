import { describe, it, expect, vi } from "vitest";

import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

import type { ParamsSearch } from "@real-router/core";

/**
 * RFC-4 M2 (#1548) §4 — two-channel `encodeParams` / `decodeParams`.
 *
 * The codec contract is `({ params, search }) => { params, search }`: a route
 * codec sees BOTH the path channel and the query channel and returns both. This
 * suite pins the load-bearing behaviors:
 *
 *  - **v1 coverage restored** — a query value reaches `decodeParams` (v1 ran the
 *    whole path+query bag through the callback; the M2 params-only interim had
 *    silently narrowed that to path-only — the В2.5 gap this closes).
 *  - **both channels transformable** — a decoder/encoder can reshape `search` as
 *    well as `params`, and the result lands in `state.search` / the built URL.
 *  - **passthrough** — with no codec the channels flow through untouched.
 *  - **order** — `decodeParams` runs inside `matchPath` (the engine), BEFORE the
 *    `forwardState` interceptor seam a search-schema plugin hooks (engine → plugin,
 *    the v1 order).
 */
describe("core/routes — two-channel encode/decode (RFC-4 M2 §4)", () => {
  describe("decodeParams sees both channels (v1 coverage)", () => {
    it("passes the parsed query to the decoder, not just path params", () => {
      const seen: ParamsSearch[] = [];
      const router = createRouter([
        {
          name: "y",
          path: "/y/:id?page&zzz",
          decodeParams: (channels) => {
            seen.push(structuredClone(channels));

            return channels;
          },
        },
      ]);

      const state = getPluginApi(router).matchPath("/y/5?page=2&zzz=9");

      // The decoder received BOTH channels — the query is no longer invisible
      // to the codec (the whole point of §4 / the killed В2.5 gap).
      expect(seen).toHaveLength(1);
      expect(seen[0]).toStrictEqual({
        params: { id: "5" },
        search: { page: 2, zzz: 9 },
      });

      // Passthrough decoder leaves the committed split unchanged.
      expect(state?.params).toStrictEqual({ id: "5" });
      expect(state?.search).toStrictEqual({ page: 2, zzz: 9 });
    });

    it("lets the decoder transform the query channel into state.search", () => {
      const router = createRouter([
        {
          name: "y",
          path: "/y/:id?page",
          decodeParams: ({ params, search }) => ({
            params: { ...params, id: Number(params.id) },
            search: { ...search, page: Number(search.page) * 10 },
          }),
        },
      ]);

      const state = getPluginApi(router).matchPath("/y/5?page=2");

      // path channel transformed…
      expect(state?.params).toStrictEqual({ id: 5 });
      // …and the SEARCH channel transformed too (impossible under params-only).
      expect(state?.search).toStrictEqual({ page: 20 });
    });

    it("does not invoke the decoder when none is configured (passthrough)", () => {
      const router = createRouter([{ name: "y", path: "/y/:id?page" }]);

      const state = getPluginApi(router).matchPath("/y/5?page=2");

      expect(state?.params).toStrictEqual({ id: "5" });
      expect(state?.search).toStrictEqual({ page: 2 });
    });
  });

  describe("encodeParams shapes both channels on buildPath", () => {
    it("builds the path from the returned params and the query from the returned search", () => {
      const router = createRouter([
        {
          name: "z",
          path: "/z/:id?tag",
          encodeParams: ({ params, search }) => ({
            params: { ...params, id: `E-${params.id as string}` },
            search: { ...search, tag: `T-${search.tag as string}` },
          }),
        },
      ]);

      const path = router.buildPath("z", { id: "7" }, { tag: "x" });

      // Both channels reached the URL — path slot AND query string.
      expect(path).toBe("/z/E-7?tag=T-x");
    });

    it("passes both channels through when no encoder is configured", () => {
      const router = createRouter([{ name: "z", path: "/z/:id?tag" }]);

      expect(router.buildPath("z", { id: "7" }, { tag: "x" })).toBe(
        "/z/7?tag=x",
      );
    });
  });

  describe("path-only codec roundtrip is preserved", () => {
    it("encodes on build and decodes on match, with search untouched", async () => {
      const router = createRouter([
        {
          name: "withEncoder",
          path: "/encoded/:param1/:param2",
          encodeParams: ({ params: { one, two }, search }) => ({
            params: { param1: one, param2: two },
            search,
          }),
          decodeParams: ({ params: { param1, param2 }, search }) => ({
            params: { one: param1, two: param2 },
            search,
          }),
        },
      ]);

      const path = router.buildPath("withEncoder", { one: "A", two: "B" });

      expect(path).toBe("/encoded/A/B");

      await router.start(path);
      const state = router.getState();

      expect(state?.params).toStrictEqual({ one: "A", two: "B" });
      expect(state?.search).toStrictEqual({});
    });
  });

  describe("order: decodeParams (engine) runs before the forwardState seam", () => {
    it("invokes the decoder before a forwardState interceptor observes the state", () => {
      const order: string[] = [];
      const router = createRouter([
        {
          name: "y",
          path: "/y/:id?page",
          decodeParams: (channels) => {
            order.push("decode");

            return channels;
          },
        },
      ]);

      // A forwardState interceptor stands where a search-schema plugin validates
      // the query on the URL→State path — it must see a state the decoder already
      // shaped (engine codec → plugin, the v1 order).
      getPluginApi(router).addInterceptor(
        "forwardState",
        (next, name, params, search) => {
          order.push("forwardState");

          return next(name, params, search);
        },
      );

      getPluginApi(router).matchPath("/y/5?page=2");

      expect(order).toStrictEqual(["decode", "forwardState"]);
    });
  });

  describe("a returned nullish channel falls back to the input (defensive)", () => {
    it("keeps the matched channels when a decoder violates its return contract", () => {
      const router = createRouter([
        {
          name: "y",
          path: "/y/:id?page",
          // deliberate contract violation — decoder returns undefined
          decodeParams: vi.fn(() => undefined as unknown as ParamsSearch),
        },
      ]);

      const state = getPluginApi(router).matchPath("/y/5?page=2");

      // The wrapper's `?? channels` fallback preserves the matched channels.
      expect(state?.params).toStrictEqual({ id: "5" });
      expect(state?.search).toStrictEqual({ page: 2 });
    });
  });
});
