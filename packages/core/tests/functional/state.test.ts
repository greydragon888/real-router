import { createRouteTree, createMatcher } from "route-tree";
import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { createRouter } from "@real-router/core";

import {
  buildNameFromSegments,
  createRouteState,
} from "../../src/namespaces/RoutesNamespace/stateBuilder";
import { createTestRouter } from "../helpers";

import type { Router, Route } from "@real-router/core";

let router: Router;

describe("core/state", () => {
  beforeEach(async () => {
    router = createTestRouter();
    await router.start();
  });

  afterEach(() => {
    router.stop();
  });

  describe("getState", () => {
    it("returns undefined when router not started", () => {
      router.stop();

      expect(router.getState()).toBe(undefined);
    });

    it("returns state after navigation", async () => {
      await router.navigate("users.view", { id: "123" });

      const state = router.getState();

      expect(state?.name).toBe("users.view");
      expect(state?.params).toStrictEqual({ id: "123" });
    });
  });

  describe("getPreviousState", () => {
    it("returns undefined before first navigation", () => {
      expect(router.getPreviousState()).toBeUndefined();
    });

    it("returns previous state after navigation", async () => {
      await router.navigate("sign-in");

      const previousState = router.getPreviousState();

      expect(previousState).toBeDefined();
      expect(previousState?.name).toBe("home");
    });

    it("updates previous state on subsequent navigations", async () => {
      await router.navigate("sign-in");
      await router.navigate("users");

      const previousState = router.getPreviousState();

      expect(previousState?.name).toBe("sign-in");
    });

    it("preserves previous state params", async () => {
      await router.navigate("users.view", { id: "123" });
      await router.navigate("home");

      const previousState = router.getPreviousState();

      expect(previousState?.name).toBe("users.view");
      expect(previousState?.params).toStrictEqual({ id: "123" });
    });

    it("returns frozen state (immutable)", () => {
      void router.navigate("sign-in");

      const previousState = router.getPreviousState();

      expect(Object.isFrozen(previousState)).toBe(true);
    });
  });

  describe("makeState", () => {
    it("returns valid state object", () => {
      const state = router.makeState("home", { foo: "bar" }, "/home");

      expect(state).toMatchObject({
        name: "home",
        path: "/home",
        params: { foo: "bar" },
      });
      expect(state.meta).toBe(undefined);
    });

    it("merges with defaultParams", () => {
      // Add a route with defaultParams
      router.addRoute({
        name: "withDefaults",
        path: "/with-defaults",
        defaultParams: { lang: "en" },
      });
      const state = router.makeState(
        "withDefaults",
        { id: 123 },
        "/with-defaults",
      );

      expect(state.params).toStrictEqual({ lang: "en", id: 123 });
    });

    it("uses empty params when no params and no defaultParams (line 328)", () => {
      // home route has no defaultParams defined
      // Call makeState with undefined params (no params, no defaults)
      const state = router.makeState("home", undefined as never, "/home");

      expect(state.params).toStrictEqual({});
    });

    it("uses forced ID if provided", () => {
      const state = router.makeState(
        "home",
        {},
        "/home",
        { params: {}, options: {}, redirected: false, source: "" },
        999,
      );

      expect(state.meta?.id).toBe(999);
    });

    describe("argument validation", () => {
      it("throws TypeError for non-string name", () => {
        expect(() =>
          router.makeState(123 as unknown as string, {}),
        ).toThrowError(TypeError);
        expect(() =>
          router.makeState(null as unknown as string, {}),
        ).toThrowError(/Invalid name/);
      });

      it("throws TypeError for invalid params", () => {
        expect(() => router.makeState("home", "invalid" as never)).toThrowError(
          TypeError,
        );
        expect(() =>
          router.makeState("home", (() => {}) as never),
        ).toThrowError(/Invalid params/);
      });

      it("throws TypeError for non-string path", () => {
        expect(() =>
          router.makeState("home", {}, 123 as unknown as string),
        ).toThrowError(TypeError);
        expect(() =>
          router.makeState("home", {}, {} as unknown as string),
        ).toThrowError(/Invalid path/);
      });

      it("throws TypeError for non-number forceId", () => {
        expect(() =>
          router.makeState(
            "home",
            {},
            "/home",
            { params: {}, options: {}, redirected: false },
            "999" as unknown as number,
          ),
        ).toThrowError(TypeError);
        expect(() =>
          router.makeState(
            "home",
            {},
            "/home",
            { params: {}, options: {}, redirected: false },
            {} as unknown as number,
          ),
        ).toThrowError(/Invalid forceId/);
      });
    });
  });

  describe("areStatesEqual", () => {
    it("returns true for same name and params", () => {
      const s1 = router.makeState("home", { id: 1 }, "/home");
      const s2 = router.makeState("home", { id: 1 }, "/home");

      expect(router.areStatesEqual(s1, s2)).toBe(true);
    });

    it("returns false for different names", () => {
      const s1 = router.makeState("home", {}, "/home");
      const s2 = router.makeState("admin", {}, "/admin");

      expect(router.areStatesEqual(s1, s2)).toBe(false);
    });

    it("returns false for different params", () => {
      const s1 = router.makeState("items", { id: 1 }, "/home");
      const s2 = router.makeState("items", { id: 2 }, "/home");

      // `id` is not query param
      expect(router.areStatesEqual(s1, s2, true)).toBe(false);
    });

    it("returns true for different params with ignore query params", () => {
      const s1 = router.makeState("home", { id: 1 }, "/home");
      const s2 = router.makeState("home", { id: 2 }, "/home");

      // `id` is query param
      expect(router.areStatesEqual(s1, s2)).toBe(true);
    });

    it("returns true for different params without ignore query params", () => {
      const s1 = router.makeState("items", { id: 1 }, "/home");
      const s2 = router.makeState("items", { id: 2 }, "/home");

      expect(router.areStatesEqual(s1, s2, false)).toBe(false);
    });

    it("compares query params when ignoreQueryParams is false", () => {
      const s1 = router.makeState("home", { foo: "bar", q: "1" }, "/home");
      const s2 = router.makeState("home", { foo: "bar", q: "1" }, "/home");

      expect(router.areStatesEqual(s1, s2, false)).toBe(true);
    });

    it("should return true when both states are undefined", () => {
      expect(router.areStatesEqual(undefined, undefined)).toBe(true);
    });

    it("should use cached urlParams on second call (line 118 cache hit)", () => {
      // First call computes and caches urlParams for "home"
      const s1 = router.makeState("home", { id: 1 }, "/home");
      const s2 = router.makeState("home", { id: 1 }, "/home");

      expect(router.areStatesEqual(s1, s2, true)).toBe(true);

      // Second call uses cached urlParams (line 118 returns early)
      const s3 = router.makeState("home", { id: 2 }, "/home");
      const s4 = router.makeState("home", { id: 2 }, "/home");

      expect(router.areStatesEqual(s3, s4, true)).toBe(true);
    });

    it("should return false when one state is undefined", () => {
      const state = router.makeState("home", {}, "/home");

      expect(router.areStatesEqual(state, undefined)).toBe(false);
      expect(router.areStatesEqual(undefined, state)).toBe(false);
    });

    it("should handle non-existent route names with ignoreQueryParams (line 28)", () => {
      // getSegmentsByName returns null for non-existent routes
      // The ?? [] fallback should handle this case
      const s1 = router.makeState(
        "nonexistent.route",
        { id: 1 },
        "/nonexistent",
      );
      const s2 = router.makeState(
        "nonexistent.route",
        { id: 1 },
        "/nonexistent",
      );

      // With ignoreQueryParams=true (default), getUrlParams is called
      // For non-existent routes, getSegmentsByName returns null, triggering ?? []
      expect(router.areStatesEqual(s1, s2, true)).toBe(true);
    });

    it("should return false for non-existent routes with different params", () => {
      const s1 = router.makeState("unknown.route", { x: 1 }, "/unknown");
      const s2 = router.makeState("unknown.route", { x: 2 }, "/unknown");

      // With ignoreQueryParams=true, urlParams is empty (from ?? [])
      // So no params are compared, states are equal by name only
      expect(router.areStatesEqual(s1, s2, true)).toBe(true);

      // With ignoreQueryParams=false, all params are compared
      expect(router.areStatesEqual(s1, s2, false)).toBe(false);
    });

    describe("argument validation", () => {
      it("does not throw for null/undefined states", () => {
        const validState = router.makeState("home", {}, "/home");

        // null/undefined are valid inputs (represent "no state")
        // Using 'as never' to test runtime behavior with null values
        expect(() =>
          router.areStatesEqual(null as never, null as never),
        ).not.toThrowError();
        expect(() =>
          router.areStatesEqual(undefined, undefined),
        ).not.toThrowError();
        expect(() =>
          router.areStatesEqual(validState, null as never),
        ).not.toThrowError();
        expect(() =>
          router.areStatesEqual(null as never, validState),
        ).not.toThrowError();
      });

      it("throws TypeError for invalid state1", () => {
        const validState = router.makeState("home", {}, "/home");

        expect(() =>
          router.areStatesEqual("invalid" as never, validState),
        ).toThrowError(TypeError);
        expect(() =>
          router.areStatesEqual({ name: "x" } as never, validState),
        ).toThrowError(/Invalid state/);
      });

      it("throws TypeError for invalid state2", () => {
        const validState = router.makeState("home", {}, "/home");

        expect(() =>
          router.areStatesEqual(validState, "invalid" as never),
        ).toThrowError(TypeError);
        expect(() =>
          router.areStatesEqual(validState, 123 as never),
        ).toThrowError(/Invalid state/);
      });

      it("throws TypeError for invalid ignoreQueryParams", () => {
        const s1 = router.makeState("home", {}, "/home");
        const s2 = router.makeState("home", {}, "/home");

        expect(() =>
          router.areStatesEqual(s1, s2, "true" as never),
        ).toThrowError(TypeError);
        expect(() => router.areStatesEqual(s1, s2, 1 as never)).toThrowError(
          /Invalid ignoreQueryParams/,
        );
      });
    });

    describe("edge cases - issue #515 (different keys with same length)", () => {
      it("returns false when params have different keys (undefined value case)", () => {
        // Original router5 bug: {a: 1, b: undefined} vs {a: 1, c: 2}
        // Same length but different keys - should be false
        const s1 = router.makeState(
          "home",
          { a: 1, b: undefined } as never,
          "/home",
        );
        const s2 = router.makeState("home", { a: 1, c: 2 } as never, "/home");

        expect(router.areStatesEqual(s1, s2, false)).toBe(false);
      });

      it("returns false when state1 has key that state2 lacks", () => {
        const s1 = router.makeState("home", { x: 1, y: 2 }, "/home");
        const s2 = router.makeState("home", { x: 1, z: 2 }, "/home");

        expect(router.areStatesEqual(s1, s2, false)).toBe(false);
      });

      it("returns true when both have same keys with undefined values", () => {
        const s1 = router.makeState(
          "home",
          { a: 1, b: undefined } as never,
          "/home",
        );
        const s2 = router.makeState(
          "home",
          { a: 1, b: undefined } as never,
          "/home",
        );

        expect(router.areStatesEqual(s1, s2, false)).toBe(true);
      });
    });

    describe("edge cases - issue #478 (array params comparison)", () => {
      it("returns true for equal array params (deep equality)", () => {
        const s1 = router.makeState("home", { tags: ["a", "b", "c"] }, "/home");
        const s2 = router.makeState("home", { tags: ["a", "b", "c"] }, "/home");

        // Different array references but same content
        expect(s1.params.tags).not.toBe(s2.params.tags);
        expect(router.areStatesEqual(s1, s2, false)).toBe(true);
      });

      it("returns false for different array lengths", () => {
        const s1 = router.makeState("home", { ids: [1, 2, 3] }, "/home");
        const s2 = router.makeState("home", { ids: [1, 2] }, "/home");

        expect(router.areStatesEqual(s1, s2, false)).toBe(false);
      });

      it("returns false for different array content", () => {
        const s1 = router.makeState("home", { ids: [1, 2, 3] }, "/home");
        const s2 = router.makeState("home", { ids: [1, 2, 4] }, "/home");

        expect(router.areStatesEqual(s1, s2, false)).toBe(false);
      });

      it("returns true for nested arrays with same content", () => {
        const s1 = router.makeState(
          "home",
          {
            matrix: [
              [1, 2],
              [3, 4],
            ],
          } as never,
          "/home",
        );
        const s2 = router.makeState(
          "home",
          {
            matrix: [
              [1, 2],
              [3, 4],
            ],
          } as never,
          "/home",
        );

        expect(router.areStatesEqual(s1, s2, false)).toBe(true);
      });

      it("returns false for nested arrays with different content", () => {
        const s1 = router.makeState(
          "home",
          {
            matrix: [
              [1, 2],
              [3, 4],
            ],
          } as never,
          "/home",
        );
        const s2 = router.makeState(
          "home",
          {
            matrix: [
              [1, 2],
              [3, 5],
            ],
          } as never,
          "/home",
        );

        expect(router.areStatesEqual(s1, s2, false)).toBe(false);
      });

      it("returns false when comparing array to non-array", () => {
        const s1 = router.makeState("home", { data: [1, 2, 3] }, "/home");
        const s2 = router.makeState("home", { data: "1,2,3" }, "/home");

        expect(router.areStatesEqual(s1, s2, false)).toBe(false);
      });

      it("handles empty arrays correctly", () => {
        const s1 = router.makeState("home", { items: [] }, "/home");
        const s2 = router.makeState("home", { items: [] }, "/home");

        expect(router.areStatesEqual(s1, s2, false)).toBe(true);
      });

      it("returns true for same array reference", () => {
        const sharedArray = ["x", "y"];
        const s1 = router.makeState("home", { tags: sharedArray }, "/home");
        const s2 = router.makeState("home", { tags: sharedArray }, "/home");

        expect(router.areStatesEqual(s1, s2, false)).toBe(true);
      });
    });
  });

  describe("forwardState", () => {
    it("returns same state if no forward defined", () => {
      const state = router.forwardState("home", { id: 1 });

      expect(state.name).toBe("home");
      expect(state.params.id).toBe(1);
    });

    it("forwards to another route with merged params", () => {
      // Add routes with defaultParams
      router.addRoute([
        { name: "srcRoute", path: "/src", defaultParams: { a: 1 } },
        { name: "dstRoute", path: "/dst", defaultParams: { b: 2 } },
      ]);
      router.updateRoute("srcRoute", { forwardTo: "dstRoute" });

      const state = router.forwardState("srcRoute", { c: 3 });

      expect(state.name).toBe("dstRoute");
      expect(state.params).toStrictEqual({ a: 1, b: 2, c: 3 });
    });

    it("forwards with only source route defaults (line 595)", () => {
      // Add routes: source has defaults, target doesn't
      router.addRoute([
        {
          name: "srcWithDefaults",
          path: "/src-with-defaults",
          defaultParams: { a: 1 },
        },
        { name: "dstNoDefaults", path: "/dst-no-defaults" },
      ]);
      router.updateRoute("srcWithDefaults", {
        forwardTo: "dstNoDefaults",
      });

      const state = router.forwardState("srcWithDefaults", { c: 3 });

      expect(state.name).toBe("dstNoDefaults");
      expect(state.params).toStrictEqual({ a: 1, c: 3 });
    });

    it("forwards with only target route defaults (line 598)", () => {
      // Add routes: source has no defaults, target has defaults
      router.addRoute([
        { name: "srcNoDefaults", path: "/src-no-defaults" },
        {
          name: "dstWithDefaults",
          path: "/dst-with-defaults",
          defaultParams: { b: 2 },
        },
      ]);
      router.updateRoute("srcNoDefaults", {
        forwardTo: "dstWithDefaults",
      });

      const state = router.forwardState("srcNoDefaults", { c: 3 });

      expect(state.name).toBe("dstWithDefaults");
      expect(state.params).toStrictEqual({ b: 2, c: 3 });
    });

    describe("argument validation", () => {
      it("throws TypeError for non-string routeName", () => {
        expect(() =>
          router.forwardState(123 as unknown as string, {}),
        ).toThrowError(TypeError);
        expect(() =>
          router.forwardState(null as unknown as string, {}),
        ).toThrowError(/Invalid routeName/);
      });

      it("throws TypeError for invalid routeParams", () => {
        expect(() =>
          router.forwardState("home", "invalid" as never),
        ).toThrowError(TypeError);
        expect(() =>
          router.forwardState("home", (() => {}) as never),
        ).toThrowError(/Invalid routeParams/);
      });
    });
  });

  describe("buildState", () => {
    it("returns state if route exists", () => {
      const state = router.buildState("home", {});

      expect(state?.name).toBe("home");
      expect(state?.params).toStrictEqual({});
    });

    it("returns undefined if route is unknown", () => {
      const state = router.buildState("unknown.route", {});

      expect(state).toBe(undefined);
    });

    describe("argument validation", () => {
      it("throws TypeError for non-string routeName", () => {
        expect(() =>
          router.buildState(123 as unknown as string, {}),
        ).toThrowError(TypeError);
        expect(() =>
          router.buildState(null as unknown as string, {}),
        ).toThrowError(/Invalid routeName/);
      });

      it("throws TypeError for invalid routeParams", () => {
        expect(() =>
          router.buildState("home", "invalid" as never),
        ).toThrowError(TypeError);
        expect(() =>
          router.buildState("home", (() => {}) as never),
        ).toThrowError(/Invalid routeParams/);
      });
    });
  });
});

describe("core/stateBuilder", () => {
  describe("buildNameFromSegments", () => {
    it("builds dot-separated name from segments", () => {
      const tree = createRouteTree("", "", [
        {
          name: "users",
          path: "/users",
          children: [{ name: "profile", path: "/:id" }],
        },
      ]);

      const matcher = createMatcher();

      matcher.registerTree(tree);
      const result = matcher.match("/users/123");

      expect(result).not.toBeNull();
      expect(buildNameFromSegments(result!.segments)).toBe("users.profile");
    });

    it("returns empty string for no segments", () => {
      expect(buildNameFromSegments([])).toBe("");
    });

    it("skips segments with empty names", () => {
      const tree = createRouteTree("", "", [{ name: "home", path: "/home" }]);

      const matcher = createMatcher();

      matcher.registerTree(tree);
      const result = matcher.match("/home");

      expect(result).not.toBeNull();
      expect(buildNameFromSegments(result!.segments)).toBe("home");
    });

    it("returns fullName from last segment", () => {
      const segments = [{ fullName: "users" }, { fullName: "users.profile" }];

      expect(buildNameFromSegments(segments as any)).toBe("users.profile");
    });

    it("returns empty string when last segment has no fullName", () => {
      const segments = [{ fullName: undefined }];

      expect(buildNameFromSegments(segments as any)).toBe("");
    });
  });

  describe("createRouteState", () => {
    it("creates RouteTreeState from MatchResult", () => {
      const tree = createRouteTree("", "", [
        {
          name: "users",
          path: "/users",
          children: [{ name: "view", path: "/:id" }],
        },
      ]);

      const matcher = createMatcher();

      matcher.registerTree(tree);
      const result = matcher.match("/users/123");

      expect(result).not.toBeNull();

      const state = createRouteState(result!);

      expect(state).toStrictEqual({
        name: "users.view",
        params: { id: "123" },
        meta: {
          users: {},
          "users.view": { id: "url" },
        },
      });
    });

    it("uses explicit name when provided", () => {
      const tree = createRouteTree("", "", [{ name: "route", path: "/route" }]);

      const matcher = createMatcher();

      matcher.registerTree(tree);
      const result = matcher.match("/route");

      expect(result).not.toBeNull();

      const state = createRouteState(result!, "custom.name");

      expect(state.name).toBe("custom.name");
    });

    it("creates state with query params meta", () => {
      const tree = createRouteTree("", "", [
        { name: "search", path: "/search?q&page" },
      ]);

      const matcher = createMatcher();

      matcher.registerTree(tree);
      const result = matcher.match("/search?q=test&page=1");

      expect(result).not.toBeNull();

      const state = createRouteState(result!);

      expect(state.meta).toStrictEqual({
        search: { q: "query", page: "query" },
      });
    });
  });

  describe("not found state via start with allowNotFound", () => {
    it("creates not found state when starting at unknown path", async () => {
      const freshRouter = createTestRouter({ allowNotFound: true });

      await freshRouter.start("/completely/unknown/path");

      const state = freshRouter.getState();

      expect(state?.name).toBe("@@router/UNKNOWN_ROUTE");
      expect(state?.path).toBe("/completely/unknown/path");
      expect(state?.params).toStrictEqual({ path: "/completely/unknown/path" });

      freshRouter.stop();
    });
  });

  describe("forwardTo function", () => {
    it("should resolve basic dynamic forwardTo with dependency", () => {
      const testRouter = createRouter(
        [
          {
            name: "dash",
            path: "/dash",
            forwardTo: (getDep) => (getDep("user").isAdmin ? "admin" : "user"),
          },
          { name: "admin", path: "/admin" },
          { name: "user", path: "/user" },
        ],
        { defaultRoute: "user" },
        { user: { isAdmin: true } },
      );

      void testRouter.start("");

      const result = testRouter.forwardState("dash", {});

      expect(result.name).toBe("admin");

      testRouter.stop();
    });

    it("should pass params to forwardTo callback", () => {
      const testRouter = createRouter(
        [
          {
            name: "item",
            path: "/item/:type",
            forwardTo: (_getDep, params) =>
              params.type === "book" ? "book-viewer" : "default-viewer",
          },
          { name: "book-viewer", path: "/book-viewer" },
          { name: "default-viewer", path: "/default-viewer" },
        ],
        { defaultRoute: "default-viewer" },
        {},
      );

      void testRouter.start("");

      const result = testRouter.forwardState("item", { type: "book" });

      expect(result.name).toBe("book-viewer");

      testRouter.stop();
    });

    it("should detect cycles in dynamic forwardTo", () => {
      const testRouter = createRouter(
        [
          { name: "cycle-a", path: "/cycle-a", forwardTo: () => "cycle-b" },
          { name: "cycle-b", path: "/cycle-b", forwardTo: () => "cycle-a" },
        ],
        {},
        {},
      );

      void testRouter.start("");

      expect(() => testRouter.forwardState("cycle-a", {})).toThrowError(
        /Circular forwardTo/,
      );

      testRouter.stop();
    });

    it("should resolve mixed chain: static → dynamic", () => {
      router.addRoute([
        { name: "static-start", path: "/static-start", forwardTo: "dynamic" },
        {
          name: "dynamic",
          path: "/dynamic",
          forwardTo: () => "final-dest",
        },
        { name: "final-dest", path: "/final-dest" },
      ]);

      const result = router.forwardState("static-start", {});

      expect(result.name).toBe("final-dest");
    });

    it("should resolve mixed chain: dynamic → static", () => {
      router.addRoute([
        {
          name: "dynamic-start",
          path: "/dynamic-start",
          forwardTo: () => "static-mid",
        },
        { name: "static-mid", path: "/static-mid", forwardTo: "end" },
        { name: "end", path: "/end" },
      ]);

      const result = router.forwardState("dynamic-start", {});

      expect(result.name).toBe("end");
    });

    it("should resolve dynamic → dynamic chain", () => {
      router.addRoute([
        { name: "dyn-1", path: "/dyn-1", forwardTo: () => "dyn-2" },
        { name: "dyn-2", path: "/dyn-2", forwardTo: () => "dyn-3" },
        { name: "dyn-3", path: "/dyn-3" },
      ]);

      const result = router.forwardState("dyn-1", {});

      expect(result.name).toBe("dyn-3");
    });

    it("should throw for non-existent target returned by function", () => {
      router.addRoute({
        name: "bad-fn",
        path: "/bad-fn",
        forwardTo: () => "nonexistent",
      });

      expect(() => router.forwardState("bad-fn", {})).toThrowError(
        /does not exist/,
      );
    });

    it("should bubble errors from forwardTo callback naturally", () => {
      router.addRoute({
        name: "error-fn",
        path: "/error-fn",
        forwardTo: () => {
          throw new Error("Custom callback error");
        },
      });

      expect(() => router.forwardState("error-fn", {})).toThrowError(
        "Custom callback error",
      );
    });

    it("should throw TypeError for non-string return from callback", () => {
      router.addRoute({
        name: "bad-return",
        path: "/bad-return",
        forwardTo: (() => 123) as any,
      });

      expect(() => router.forwardState("bad-return", {})).toThrowError(
        TypeError,
      );
    });

    it("should throw when exceeding max depth (100 hops)", () => {
      const routes: Route[] = [];

      for (let i = 0; i < 102; i++) {
        if (i < 101) {
          routes.push({
            name: `hop-${i}`,
            path: `/hop-${i}`,
            forwardTo: () => `hop-${i + 1}`,
          });
        } else {
          routes.push({
            name: `hop-${i}`,
            path: `/hop-${i}`,
          });
        }
      }

      router.addRoute(routes);

      expect(() => router.forwardState("hop-0", {})).toThrowError(
        /exceeds maximum depth/,
      );
    });

    it("should work with buildState after dynamic forward resolution", () => {
      router.addRoute([
        { name: "build-fn", path: "/build-fn", forwardTo: () => "build-dest" },
        { name: "build-dest", path: "/build-dest" },
      ]);

      const state = router.buildState("build-fn", {});

      expect(state?.name).toBe("build-dest");
    });

    it("should work with rewritePathOnMatch and dynamic forwardTo", () => {
      const testRouter = createTestRouter({ rewritePathOnMatch: true });

      testRouter.addRoute([
        {
          name: "rewrite-fn",
          path: "/rewrite-fn",
          forwardTo: () => "rewrite-target",
        },
        { name: "rewrite-target", path: "/rewrite-target" },
      ]);

      void testRouter.start("");

      const state = testRouter.matchPath("/rewrite-fn");

      expect(state?.name).toBe("rewrite-target");
      expect(state?.path).toBe("/rewrite-target");

      testRouter.stop();
    });

    it("should expose function in getRoute().forwardTo", () => {
      const forwardFn = () => "target";

      router.addRoute({
        name: "get-fn",
        path: "/get-fn",
        forwardTo: forwardFn,
      });

      const route = router.getRoute("get-fn");

      expect(route?.forwardTo).toBe(forwardFn);
    });

    it("should detect self-forward when function returns own name", () => {
      router.addRoute({
        name: "self-fn",
        path: "/self-fn",
        forwardTo: () => "self-fn",
      });

      expect(() => router.forwardState("self-fn", {})).toThrowError(
        /Circular forwardTo/,
      );
    });

    it("should throw for empty string returned from callback", () => {
      router.addRoute({
        name: "empty-return",
        path: "/empty-return",
        forwardTo: () => "",
      });

      expect(() => router.forwardState("empty-return", {})).toThrowError(
        /does not exist/,
      );
    });

    it("should not affect pure static forward chains", () => {
      router.addRoute([
        { name: "pure-a", path: "/pure-a", forwardTo: "pure-b" },
        { name: "pure-b", path: "/pure-b", forwardTo: "pure-c" },
        { name: "pure-c", path: "/pure-c" },
      ]);

      const result = router.forwardState("pure-a", {});

      expect(result.name).toBe("pure-c");
    });
  });
});
