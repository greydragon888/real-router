import { describe, expect, it } from "vitest";

import { createRouter } from "@real-router/core";
import { getPluginApi, getRoutesApi } from "@real-router/core/api";

/**
 * RFC-4 M2 (#1548) §4 follow-up — `defaultParams` routed by channel (#1549).
 *
 * A default declared for a **query** name (`?page` + `defaultParams.page`)
 * belongs to `state.search`; a default for a **path** name (`:id`) belongs to
 * `state.params`; an **arbitrary** (undeclared, non-path) default keeps its v1
 * home in `state.params`. The channel routing must hold on every state-building
 * path — match (`start`/`matchPath`), navigate (v1 single-bag AND the explicit
 * search channel), `buildPath`, and the `matchPath` URL rebuild — with an
 * explicitly-given value always winning over the default, in one channel only
 * (no duplication, no value split across channels).
 */
describe("core/state — defaultParams channel routing (#1549)", () => {
  const QUERY_DEFAULT_ROUTES = [
    { name: "home", path: "/home" },
    { name: "x", path: "/x?page&sort", defaultParams: { page: "5" } },
  ];

  describe("match path (start / matchPath)", () => {
    it("routes a query-declared default into state.search, not state.params", async () => {
      const router = createRouter(QUERY_DEFAULT_ROUTES);

      await router.start("/x");

      const state = router.getState()!;

      expect(state.params).toStrictEqual({});
      expect(state.search).toStrictEqual({ page: "5" });
      // The query-typed default still reaches the rebuilt URL.
      expect(state.path).toBe("/x?page=5");
    });

    it("lets the URL query win over a query-typed default — in state.search AND state.path", async () => {
      const router = createRouter(QUERY_DEFAULT_ROUTES);

      await router.start("/x?page=9");

      const state = router.getState()!;

      expect(state.params).toStrictEqual({});
      expect(state.search).toStrictEqual({ page: 9 });
      // Secondary symptom: the rebuilt state.path must show the URL's value,
      // not the default.
      expect(state.path).toBe("/x?page=9");
    });

    it("keeps a path default in state.params", async () => {
      const router = createRouter([
        { name: "u", path: "/u/:id", defaultParams: { id: "1" } },
      ]);

      await router.start("/u/7");

      const state = router.getState()!;

      expect(state.params).toStrictEqual({ id: "7" });
      expect(state.search).toStrictEqual({});
    });

    it("keeps an arbitrary (undeclared) default in state.params", async () => {
      const router = createRouter([
        { name: "s", path: "/s", defaultParams: { theme: "dark" } },
      ]);

      await router.start("/s");

      const state = router.getState()!;

      expect(state.params).toStrictEqual({ theme: "dark" });
      expect(state.search).toStrictEqual({});
    });
  });

  describe("navigate path", () => {
    it("routes a query-declared default into state.search only (no channel duplication)", async () => {
      const router = createRouter(QUERY_DEFAULT_ROUTES);

      await router.start("/home");

      const state = await router.navigate("x");

      expect(state.params).toStrictEqual({});
      expect(state.search).toStrictEqual({ page: "5" });
      expect(state.path).toBe("/x?page=5");
    });

    it("merges a query-typed default into an explicit search channel — state AND URL", async () => {
      const router = createRouter(QUERY_DEFAULT_ROUTES);

      await router.start("/home");

      const state = await router.navigate("x", {}, { sort: "asc" });

      expect(state.params).toStrictEqual({});
      expect(state.search).toStrictEqual({ page: "5", sort: "asc" });
      expect(state.path).toBe("/x?page=5&sort=asc");
    });

    it("lets an explicit search value win over a query-typed default", async () => {
      const router = createRouter(QUERY_DEFAULT_ROUTES);

      await router.start("/home");

      const state = await router.navigate("x", {}, { page: "9" });

      expect(state.params).toStrictEqual({});
      expect(state.search).toStrictEqual({ page: "9" });
      expect(state.path).toBe("/x?page=9");
    });

    it("keeps an arbitrary default in state.params only (no channel duplication)", async () => {
      const router = createRouter([
        { name: "home", path: "/home" },
        { name: "s", path: "/s", defaultParams: { theme: "dark" } },
      ]);

      await router.start("/home");

      const state = await router.navigate("s");

      expect(state.params).toStrictEqual({ theme: "dark" });
      expect(state.search).toStrictEqual({});
    });

    it("does not split an explicitly-overridden arbitrary default across channels", async () => {
      const router = createRouter([
        { name: "home", path: "/home" },
        { name: "s", path: "/s", defaultParams: { theme: "dark" } },
      ]);

      await router.start("/home");

      const state = await router.navigate("s", { theme: "light" });

      // The explicit value replaces the default in the default's own channel —
      // the default must not resurrect in params while the override sits in
      // search.
      expect(state.params).toStrictEqual({ theme: "light" });
      expect(state.search).toStrictEqual({});
    });

    it("keeps an arbitrary default in params when the same name is given via search (independent channels)", async () => {
      const router = createRouter([
        { name: "home", path: "/home" },
        { name: "s", path: "/s", defaultParams: { theme: "dark" } },
      ]);

      await router.start("/home");

      const state = await router.navigate("s", {}, { theme: "light" });

      // The channels are independent (the #843 collision precedence): a
      // search-given `theme` is the query twin of the name, not an override of
      // the params-channel default — the default stays in its own channel.
      expect(state.params).toStrictEqual({ theme: "dark" });
      expect(state.search).toStrictEqual({ theme: "light" });
    });
  });

  describe("buildPath", () => {
    it("keeps a query-typed default in the URL when an explicit search bag is passed", () => {
      const router = createRouter(QUERY_DEFAULT_ROUTES);

      expect(router.buildPath("x", {}, { sort: "asc" })).toBe(
        "/x?page=5&sort=asc",
      );
    });

    it("lets an explicit search value win over a query-typed default in the URL", () => {
      const router = createRouter(QUERY_DEFAULT_ROUTES);

      expect(router.buildPath("x", {}, { page: "9" })).toBe("/x?page=9");
    });
  });

  describe("direct makeState (plugin API)", () => {
    it("routes defaults by channel when params gives neither key", () => {
      const router = createRouter([
        {
          name: "x",
          path: "/x?page",
          defaultParams: { page: "5", limit: "10" },
        },
      ]);

      const state = getPluginApi(router).makeState("x");

      // The query-declared default joins search; the arbitrary default keeps
      // its params home — with no caller bag at all.
      expect(state.params).toStrictEqual({ limit: "10" });
      expect(state.search).toStrictEqual({ page: "5" });
    });

    it("ignores inherited keys on the params bag", () => {
      const router = createRouter([{ name: "x", path: "/x?page" }]);

      const paramsWithProto = Object.create({ ghost: "1" }) as Record<
        string,
        never
      >;
      const state = getPluginApi(router).makeState("x", paramsWithProto);

      expect(state.params).toStrictEqual({});
      expect(state.search).toStrictEqual({});
    });
  });

  describe("path/query name collision (/coll/:id?id)", () => {
    it("keeps the path slot's default in params even when the query twin is given in search", () => {
      const router = createRouter([
        { name: "coll", path: "/coll/:id?id", defaultParams: { id: "1" } },
      ]);

      const state = getPluginApi(router).makeState("coll", {}, { id: 7 });

      // `search.id` is the QUERY param of the colliding name — it must not
      // count as "given" for the PATH slot, whose default still applies.
      expect(state.params).toStrictEqual({ id: "1" });
      expect(state.search).toStrictEqual({ id: 7 });
    });
  });

  describe("cache freshness across mutations", () => {
    it("re-routes a default to params after replace() drops the query declaration", async () => {
      const router = createRouter([
        { name: "home", path: "/home" },
        { name: "x", path: "/x?page", defaultParams: { page: "5" } },
      ]);

      await router.start("/home");

      // Warm the query-params cache: page is query-declared → search.
      const before = await router.navigate("x");

      expect(before.search).toStrictEqual({ page: "5" });

      getRoutesApi(router).replace([
        { name: "home", path: "/home" },
        { name: "x", path: "/x", defaultParams: { page: "5" } },
      ]);

      // The declaration is gone — a stale cache would still route page to
      // search; the fresh tree routes it to params (arbitrary default).
      const after = await router.navigate("x", {}, undefined, { reload: true });

      expect(after.params).toStrictEqual({ page: "5" });
      expect(after.search).toStrictEqual({});
    });

    it("applies a defaultParams update() to the query channel on the next navigation", async () => {
      const router = createRouter([
        { name: "home", path: "/home" },
        { name: "x", path: "/x?page", defaultParams: { page: "5" } },
      ]);

      await router.start("/home");
      await router.navigate("x");

      getRoutesApi(router).update("x", { defaultParams: { page: "7" } });

      await router.navigate("home");

      const state = await router.navigate("x");

      expect(state.search).toStrictEqual({ page: "7" });
      expect(state.params).toStrictEqual({});
    });
  });

  describe("loose queryParamsMode", () => {
    it("routes a query-declared default to search while keeping undeclared URL query", async () => {
      const router = createRouter(
        [{ name: "x", path: "/x?page", defaultParams: { page: "5" } }],
        { queryParamsMode: "loose" },
      );

      await router.start("/x?q=1");

      const state = router.getState()!;

      expect(state.params).toStrictEqual({});
      expect(state.search).toStrictEqual({ page: "5", q: 1 });
    });
  });
});
