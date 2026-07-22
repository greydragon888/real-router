// RFC-4 M2 params/search slot-shift (#1548). Proves the two equal-standing
// navigate forms (descriptor + positional `search` slot), the search-aware
// buildPath collision fix (killed #843 — path and a same-named query param no
// longer clobber each other), and the `search`-channel arg on isActiveRoute /
// canNavigateTo. Bare core accepts a colliding declaration `/items/:id?id`
// (the collision gate was removed — path-param `id` and query-param `id` are
// independent channels).

import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { createRouter } from "@real-router/core";

import type { Router, State } from "@real-router/core";

const ROUTES = [
  { name: "home", path: "/home" },
  { name: "search", path: "/search?q&page" },
  { name: "users", path: "/users/:uid" },
  // Collision: path param `id` AND query param `id` share a name — two channels.
  { name: "items", path: "/items/:id?id" },
];

let router: Router;

describe("navigate() — RFC-4 M2 params/search slot-shift (#1548)", () => {
  beforeEach(async () => {
    router = createRouter(ROUTES, { defaultRoute: "home" });
    await router.start("/home");
  });

  afterEach(() => {
    router.stop();
  });

  describe("descriptor form navigate(target, opts?)", () => {
    it("splits path into params and query into search", async () => {
      const state = await router.navigate({
        name: "search",
        search: { q: "hello", page: "2" },
      });

      expect(state.name).toBe("search");
      expect(state.params).toStrictEqual({});
      expect(state.search).toStrictEqual({ q: "hello", page: "2" });
      expect(state.path).toBe("/search?q=hello&page=2");
    });

    it("carries path params in params, query in search", async () => {
      const state = await router.navigate({
        name: "users",
        params: { uid: "42" },
      });

      expect(state.params).toStrictEqual({ uid: "42" });
      expect(state.search).toStrictEqual({});
      expect(state.path).toBe("/users/42");
    });

    it("passes opts at position 2 (replace)", async () => {
      const state = await router.navigate(
        { name: "search", search: { q: "x" } },
        { replace: true },
      );

      expect(state.transition.replace).toBe(true);
      expect(state.search).toStrictEqual({ q: "x" });
    });

    it("a descriptor with neither params nor search navigates cleanly", async () => {
      const state = await router.navigate({ name: "search" });

      expect(state.name).toBe("search");
      expect(state.params).toStrictEqual({});
      expect(state.search).toStrictEqual({});
    });
  });

  describe("positional form navigate(name, params, search, opts?)", () => {
    it("commits path from params and query from search", async () => {
      const state = await router.navigate("search", {}, { q: "hi", page: "3" });

      expect(state.params).toStrictEqual({});
      expect(state.search).toStrictEqual({ q: "hi", page: "3" });
      expect(state.path).toBe("/search?q=hi&page=3");
    });

    it("opts now lives at position 4", async () => {
      const state = await router.navigate(
        "search",
        {},
        { q: "z" },
        { replace: true },
      );

      expect(state.transition.replace).toBe(true);
      expect(state.search).toStrictEqual({ q: "z" });
    });
  });

  describe("collision /items/:id?id — path and query are independent (killed #843)", () => {
    it("descriptor keeps path id and query id distinct", async () => {
      const state = await router.navigate({
        name: "items",
        params: { id: "5" },
        search: { id: "7" },
      });

      expect(state.params).toStrictEqual({ id: "5" });
      expect(state.search).toStrictEqual({ id: "7" });
      expect(state.path).toBe("/items/5?id=7");
    });

    it("positional keeps path id and query id distinct", async () => {
      const state = await router.navigate("items", { id: "5" }, { id: "7" });

      expect(state.path).toBe("/items/5?id=7");
      expect(state.params.id).toBe("5");
      expect(state.search.id).toBe("7");
    });
  });

  describe("buildPath(route, params?, search?) — search-aware", () => {
    it("builds query from the explicit search channel", () => {
      expect(router.buildPath("search", {}, { q: "a", page: "1" })).toBe(
        "/search?q=a&page=1",
      );
    });

    it("resolves a colliding name into distinct path and query slots", () => {
      expect(router.buildPath("items", { id: "5" }, { id: "7" })).toBe(
        "/items/5?id=7",
      );
    });

    it("v1 two-arg call is unchanged (query extracted from the single bag)", () => {
      expect(router.buildPath("search", { q: "b" })).toBe("/search?q=b");
    });
  });

  describe("isActiveRoute(name, params?, search?, ...) — search slot", () => {
    it("matches on the explicit query channel", async () => {
      await router.navigate("search", {}, { q: "term", page: "1" });

      expect(router.isActiveRoute("search", {}, { q: "term", page: "1" })).toBe(
        true,
      );
    });

    it("a differing query fails an exact (strictEquality) match", async () => {
      await router.navigate("search", {}, { q: "term" });

      // ignoreQueryParams=false (position 5) so the query difference counts.
      expect(
        router.isActiveRoute("search", {}, { q: "other" }, true, false),
      ).toBe(false);
    });
  });

  describe("canNavigateTo(name, params?, search?)", () => {
    it("accepts a reachable target built with an explicit search channel", () => {
      expect(router.canNavigateTo("search", {}, { q: "x" })).toBe(true);
    });

    it("builds toState.search so guards see the query channel", () => {
      // No guards here — this just exercises the search-threaded toState build.
      expect(router.canNavigateTo("items", { id: "5" }, { id: "7" })).toBe(
        true,
      );
    });
  });

  describe("null / non-descriptor first arg stays graceful", () => {
    it("navigate(null) rejects with ROUTE_NOT_FOUND, not a crash", async () => {
      await expect(
        router.navigate(null as unknown as string),
      ).rejects.toMatchObject({ code: "ROUTE_NOT_FOUND" });
    });
  });

  it("state shape is fully split (type-level + runtime)", async () => {
    const state: State = await router.navigate("search", {}, { q: "typed" });

    expect(Object.hasOwn(state, "search")).toBe(true);
    expect(Object.isFrozen(state.search)).toBe(true);
  });
});
