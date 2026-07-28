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
    { name: "x", path: "/x?page&sort", defaultSearch: { page: "5" } },
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

    it("drops a query-declared params-bag key when the same name is also in search (search wins, #843)", async () => {
      const router = createRouter([{ name: "x", path: "/x?page" }]);

      await router.start("/x");

      // `page` (declared `?page`) handed in BOTH bags used to be a PRECEDENCE
      // question — the explicit search won and params dropped it. Since P1
      // throws (#1572) the collision cannot be spelled through a producer at
      // all: it is refused before any merge. The rule survives only where P1
      // does not reach, i.e. the predicates.
      expect(() =>
        router.navigate("x", { page: "fromParams" }, { page: "fromSearch" }),
      ).toThrow(/declares `page` as a query param/);

      expect(
        router.buildPath("x", { page: "fromParams" }, { page: "fromSearch" }),
      ).toBe("/x?page=fromSearch");
    });

    it("lets a query-declared params-bag value win over defaultSearch (user > default)", async () => {
      const router = createRouter([
        { name: "x", path: "/x?page", defaultSearch: { page: "1" } },
      ]);

      await router.start("/x");

      // `page` (declared `?page`) handed in the params bag; defaultSearch is
      // page:1. The user's params-twin MUST win over the default. Regression
      // guard for the ordering bug where forwardState folded defaultSearch into
      // its result BEFORE channel separation, so the default outranked the user
      // params-twin (`{ page: 2 }` wrongly committing page=1). Both channels AND
      // the URL are asserted (anti-remask — search must reconstruct from path).
      const state = await router.navigate("x", {}, { page: "2" });

      expect(state.params).toStrictEqual({});
      expect(state.search).toStrictEqual({ page: "2" });
      expect(state.path).toBe("/x?page=2");
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
          defaultParams: { limit: "10" },
          defaultSearch: { page: "5" },
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

    it("treats params and search as pre-separated channels — no re-split", () => {
      const router = createRouter([{ name: "x", path: "/x?page" }]);

      // makeState is a pure constructor from ALREADY-separated channels: channel
      // canonicalization happens upstream in forwardState (#1548/#1549), not
      // here. A query-declared key handed in the params bag STAYS in params — the
      // primitive never re-routes. (Callers reconstructing a serialized split
      // state — browser-plugin popstate restore — hand each channel its own bag.)
      expect(() =>
        getPluginApi(router).makeState(
          "x",
          { page: "fromParams" },
          { page: "fromSearch" },
        ),
      ).toThrow(/declares `page` as a query param/);

      // The "no re-split" contract itself is unchanged and still observable —
      // each channel keeps exactly what it was handed, once the bags are
      // channel-correct.
      const state = getPluginApi(router).makeState(
        "x",
        { other: "fromParams" },
        { page: "fromSearch" },
      );

      expect(state.params).toStrictEqual({ other: "fromParams" });
      expect(state.search).toStrictEqual({ page: "fromSearch" });
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
    it("applies a defaultSearch update() to the query channel on the next navigation", async () => {
      const router = createRouter([
        { name: "home", path: "/home" },
        { name: "x", path: "/x?page", defaultSearch: { page: "5" } },
      ]);

      await router.start("/home");
      await router.navigate("x");

      getRoutesApi(router).update("x", { defaultSearch: { page: "7" } });

      await router.navigate("home");

      const state = await router.navigate("x");

      expect(state.search).toStrictEqual({ page: "7" });
      expect(state.params).toStrictEqual({});
    });
  });

  describe("loose queryParamsMode", () => {
    it("routes a query-declared default to search while keeping undeclared URL query", async () => {
      const router = createRouter(
        [{ name: "x", path: "/x?page", defaultSearch: { page: "5" } }],
        { queryParamsMode: "loose" },
      );

      await router.start("/x?q=1");

      const state = router.getState()!;

      expect(state.params).toStrictEqual({});
      expect(state.search).toStrictEqual({ page: "5", q: 1 });
    });
  });

  describe("defaultSearch storage lifecycle (#1549)", () => {
    it("get() reflects it, update() patches (value then null), TREE_CHANGED carries it", () => {
      const router = createRouter([
        { name: "home", path: "/" },
        { name: "x", path: "/x?page", defaultSearch: { page: "5" } },
      ]);
      const routes = getRoutesApi(router);

      // get() reconstructs defaultSearch from the config store.
      expect(routes.get("x")?.defaultSearch).toStrictEqual({ page: "5" });

      const patched: unknown[] = [];

      routes.subscribeChanges((event) => {
        if (event.op === "update") {
          patched.push(event.patch.defaultSearch);
        }
      });

      // update() with a new value: buildStructuralPatch carries defaultSearch and
      // the store writes it.
      routes.update("x", { defaultSearch: { page: "9" } });

      expect(routes.get("x")?.defaultSearch).toStrictEqual({ page: "9" });

      // update() with null: the store deletes the entry; the patch carries null.
      routes.update("x", { defaultSearch: null });

      expect(routes.get("x")?.defaultSearch).toBeUndefined();
      expect(patched).toStrictEqual([{ page: "9" }, null]);
    });
  });

  describe("defaultSearch on a query-less route (makeState fast path)", () => {
    it("core honors defaultSearch in state.search even with no ?query declaration", () => {
      // The key is NOT `?`-declared, so `queryNames` is empty and makeState takes
      // its fast path. Core is tolerant: it still routes `defaultSearch` into
      // `state.search`. (An undeclared key is dropped from the URL under the
      // default queryParamsMode — declare `?a` to persist it there;
      // validation-plugin warns on the mismatch.)
      const router = createRouter([
        { name: "s", path: "/s", defaultSearch: { a: "1" } },
      ]);

      const state = getPluginApi(router).makeState("s");

      expect(state.params).toStrictEqual({});
      expect(state.search).toStrictEqual({ a: "1" });
    });
  });
});
