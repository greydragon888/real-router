import { createRouteTree, createMatcher } from "route-tree";
import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { createRouter, getPluginApi, getRoutesApi } from "@real-router/core";

import {
  buildNameFromSegments,
  createRouteState,
} from "../../src/namespaces/RoutesNamespace/RoutesNamespace";
import { createTestRouter } from "../helpers";

import type { Router, Route, RoutesApi } from "@real-router/core";

let router: Router;
let routesApi: RoutesApi;

describe("core/state", () => {
  beforeEach(async () => {
    router = createTestRouter();
    routesApi = getRoutesApi(router);
    await router.start("/home");
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

    it("returns frozen state (immutable)", async () => {
      await router.navigate("sign-in");

      const previousState = router.getPreviousState();

      expect(Object.isFrozen(previousState)).toBe(true);
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
    it("should resolve basic dynamic forwardTo with dependency", async () => {
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

      await testRouter.start("").catch(() => {});

      const result = getPluginApi(testRouter).forwardState("dash", {});

      expect(result.name).toBe("admin");

      testRouter.stop();
    });

    it("should pass params to forwardTo callback", async () => {
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

      await testRouter.start("").catch(() => {});

      const result = getPluginApi(testRouter).forwardState("item", {
        type: "book",
      });

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

      testRouter.start("").catch(() => {});

      expect(() =>
        getPluginApi(testRouter).forwardState("cycle-a", {}),
      ).toThrowError(/Circular forwardTo/);

      testRouter.stop();
    });

    it("should resolve mixed chain: static → dynamic", () => {
      routesApi.add([
        { name: "static-start", path: "/static-start", forwardTo: "dynamic" },
        {
          name: "dynamic",
          path: "/dynamic",
          forwardTo: () => "final-dest",
        },
        { name: "final-dest", path: "/final-dest" },
      ]);

      const result = getPluginApi(router).forwardState("static-start", {});

      expect(result.name).toBe("final-dest");
    });

    it("should resolve mixed chain: dynamic → static", () => {
      routesApi.add([
        {
          name: "dynamic-start",
          path: "/dynamic-start",
          forwardTo: () => "static-mid",
        },
        { name: "static-mid", path: "/static-mid", forwardTo: "end" },
        { name: "end", path: "/end" },
      ]);

      const result = getPluginApi(router).forwardState("dynamic-start", {});

      expect(result.name).toBe("end");
    });

    it("should resolve dynamic → dynamic chain", () => {
      routesApi.add([
        { name: "dyn-1", path: "/dyn-1", forwardTo: () => "dyn-2" },
        { name: "dyn-2", path: "/dyn-2", forwardTo: () => "dyn-3" },
        { name: "dyn-3", path: "/dyn-3" },
      ]);

      const result = getPluginApi(router).forwardState("dyn-1", {});

      expect(result.name).toBe("dyn-3");
    });

    it("should throw for non-existent target returned by function", () => {
      routesApi.add({
        name: "bad-fn",
        path: "/bad-fn",
        forwardTo: () => "nonexistent",
      });

      expect(() =>
        getPluginApi(router).forwardState("bad-fn", {}),
      ).toThrowError(/does not exist/);
    });

    it("should bubble errors from forwardTo callback naturally", () => {
      routesApi.add({
        name: "error-fn",
        path: "/error-fn",
        forwardTo: () => {
          throw new Error("Custom callback error");
        },
      });

      expect(() =>
        getPluginApi(router).forwardState("error-fn", {}),
      ).toThrowError("Custom callback error");
    });

    it("should throw TypeError for non-string return from callback", () => {
      routesApi.add({
        name: "bad-return",
        path: "/bad-return",
        forwardTo: (() => 123) as any,
      });

      expect(() =>
        getPluginApi(router).forwardState("bad-return", {}),
      ).toThrowError(TypeError);
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

      routesApi.add(routes);

      expect(() => getPluginApi(router).forwardState("hop-0", {})).toThrowError(
        /exceeds maximum depth/,
      );
    });

    it("should work with buildState after dynamic forward resolution", () => {
      routesApi.add([
        { name: "build-fn", path: "/build-fn", forwardTo: () => "build-dest" },
        { name: "build-dest", path: "/build-dest" },
      ]);

      const state = getPluginApi(router).buildState("build-fn", {});

      expect(state?.name).toBe("build-dest");
    });

    it("should work with rewritePathOnMatch and dynamic forwardTo", async () => {
      const testRouter = createTestRouter({ rewritePathOnMatch: true });
      const testRoutesApi = getRoutesApi(testRouter);

      testRoutesApi.add([
        {
          name: "rewrite-fn",
          path: "/rewrite-fn",
          forwardTo: () => "rewrite-target",
        },
        { name: "rewrite-target", path: "/rewrite-target" },
      ]);

      await testRouter.start("").catch(() => {});

      const state = getPluginApi(testRouter).matchPath("/rewrite-fn");

      expect(state?.name).toBe("rewrite-target");
      expect(state?.path).toBe("/rewrite-target");

      testRouter.stop();
    });

    it("should expose function in getRoute().forwardTo", () => {
      const forwardFn = () => "target";

      routesApi.add({
        name: "get-fn",
        path: "/get-fn",
        forwardTo: forwardFn,
      });

      const route = routesApi.get("get-fn");

      expect(route?.forwardTo).toBe(forwardFn);
    });

    it("should detect self-forward when function returns own name", () => {
      routesApi.add({
        name: "self-fn",
        path: "/self-fn",
        forwardTo: () => "self-fn",
      });

      expect(() =>
        getPluginApi(router).forwardState("self-fn", {}),
      ).toThrowError(/Circular forwardTo/);
    });

    it("should throw for empty string returned from callback", () => {
      routesApi.add({
        name: "empty-return",
        path: "/empty-return",
        forwardTo: () => "",
      });

      expect(() =>
        getPluginApi(router).forwardState("empty-return", {}),
      ).toThrowError(/does not exist/);
    });

    it("should not affect pure static forward chains", () => {
      routesApi.add([
        { name: "pure-a", path: "/pure-a", forwardTo: "pure-b" },
        { name: "pure-b", path: "/pure-b", forwardTo: "pure-c" },
        { name: "pure-c", path: "/pure-c" },
      ]);

      const result = getPluginApi(router).forwardState("pure-a", {});

      expect(result.name).toBe("pure-c");
    });
  });
});
