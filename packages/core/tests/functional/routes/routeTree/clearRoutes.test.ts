import { logger } from "@real-router/logger";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import {
  events,
  getDependenciesApi,
  getPluginApi,
  getRoutesApi,
} from "@real-router/core";

import { createTestRouter } from "../../../helpers";

import type { Router, RoutesApi } from "@real-router/core";

let router: Router;
let routesApi: RoutesApi;

describe("core/routes/clearRoutes", () => {
  beforeEach(async () => {
    router = createTestRouter();
    routesApi = getRoutesApi(router);
    await router.start("/home");
  });

  afterEach(() => {
    router.stop();
  });

  describe("basic functionality", () => {
    it("should clear all routes from tree", async () => {
      // createTestRouter adds default routes (home, etc.)
      expect(getPluginApi(router).matchPath("/")).toBeDefined();

      routesApi.clear();

      // All routes should be gone
      expect(getPluginApi(router).matchPath("/")).toBeUndefined();
    });

    it("should clear routes and return void", async () => {
      routesApi.clear();

      expect(getPluginApi(router).matchPath("/")).toBeUndefined();
    });

    it("should allow adding routes after clearing", async () => {
      routesApi.clear();

      routesApi.add({ name: "newHome", path: "/new-home" });

      expect(getPluginApi(router).matchPath("/new-home")?.name).toBe("newHome");
    });

    it("should clear nested routes", async () => {
      routesApi.add({
        name: "parent",
        path: "/parent",
        children: [
          {
            name: "child",
            path: "/child",
            children: [{ name: "grandchild", path: "/grandchild" }],
          },
        ],
      });

      expect(
        getPluginApi(router).matchPath("/parent/child/grandchild")?.name,
      ).toBe("parent.child.grandchild");

      routesApi.clear();

      expect(getPluginApi(router).matchPath("/parent")).toBeUndefined();
      expect(getPluginApi(router).matchPath("/parent/child")).toBeUndefined();
      expect(
        getPluginApi(router).matchPath("/parent/child/grandchild"),
      ).toBeUndefined();
    });

    it("should work when called multiple times", async () => {
      routesApi.clear();
      routesApi.clear();
      routesApi.clear();

      // Should still be functional
      routesApi.add({ name: "test", path: "/test" });

      expect(getPluginApi(router).matchPath("/test")?.name).toBe("test");
    });

    it("should work when router has no routes", async () => {
      routesApi.clear();

      // Second clear should not throw
      expect(() => {
        routesApi.clear();
      }).not.toThrowError();
    });
  });

  describe("config cleanup", () => {
    it("should clear decoders", async () => {
      const decodeParams = vi.fn((params) => ({
        ...params,
        id: Number(params.id),
      }));

      routesApi.add({
        name: "withDecoder",
        path: "/with-decoder/:id",
        decodeParams,
      });

      expect(routesApi.has("withDecoder")).toBe(true);

      // Verify decoder works before clear
      const result = getPluginApi(router).matchPath("/with-decoder/123");

      expect(result?.name).toBe("withDecoder");
      expect(result?.params.id).toBe(123);

      routesApi.clear();

      // Route no longer exists after clear
      expect(routesApi.has("withDecoder")).toBe(false);
      expect(
        getPluginApi(router).matchPath("/with-decoder/123"),
      ).toBeUndefined();
    });

    it("should clear encoders", async () => {
      const encodeParams = vi.fn((params) => ({
        ...params,
        id: `${params.id as number}`,
      }));

      routesApi.add({
        name: "decoded",
        path: "/decoded/:id",
        encodeParams,
      });

      // Verify encoder works before clear
      router.buildPath("decoded", { id: 123 });

      expect(encodeParams).toHaveBeenCalled();

      routesApi.clear();

      // Route no longer exists after clear
      expect(routesApi.has("decoded")).toBe(false);
    });

    it("should clear defaultParams", async () => {
      routesApi.add({
        name: "withDefaults",
        path: "/with-defaults",
        defaultParams: { page: 1, limit: 10 },
      });

      // Verify defaults work before clear
      expect(
        getPluginApi(router).makeState("withDefaults").params,
      ).toStrictEqual({
        page: 1,
        limit: 10,
      });

      routesApi.clear();

      // Route no longer exists after clear
      expect(routesApi.has("withDefaults")).toBe(false);
    });

    it("should clear forwardMap", async () => {
      routesApi.add({ name: "target", path: "/target" });
      routesApi.add({
        name: "redirect",
        path: "/redirect",
        forwardTo: "target",
      });

      // Verify forward works before clear
      expect(getPluginApi(router).forwardState("redirect", {}).name).toBe(
        "target",
      );

      routesApi.clear();

      // Routes no longer exist after clear
      expect(routesApi.has("redirect")).toBe(false);
      expect(routesApi.has("target")).toBe(false);
    });
  });

  describe("lifecycle cleanup", () => {
    it("should clear canActivate handlers", async () => {
      routesApi.add({
        name: "protected",
        path: "/protected",
        canActivate: () => () => false, // blocking guard
      });

      // Verify guard is active before clear
      try {
        await router.navigate("protected");
      } catch (error: any) {
        expect(error?.code).toBe("CANNOT_ACTIVATE");
      }

      routesApi.clear();

      // Re-add route without guard
      routesApi.add({ name: "protected", path: "/protected" });

      // Navigation should succeed (no guard after clear)
      await router.navigate("protected");

      expect(router.getState()?.name).toBe("protected");
    });

    it("should clear canDeactivate handlers", async () => {
      routesApi.add({ name: "editor", path: "/editor" });
      router.addDeactivateGuard("editor", () => () => false); // blocking guard

      await router.navigate("editor");

      // Try to leave - should be blocked
      try {
        await router.navigate("home");
      } catch (error: any) {
        expect(error?.code).toBe("CANNOT_DEACTIVATE");
      }

      expect(router.getState()?.name).toBe("editor");

      routesApi.clear();

      // Re-add routes without guards
      routesApi.add({ name: "editor", path: "/editor" });
      routesApi.add({ name: "home", path: "/home" });
      await router.navigate("editor");

      // Now leaving should work (guard was cleared)
      await router.navigate("home");

      expect(router.getState()?.name).toBe("home");
    });

    it("should clear all lifecycle handlers for all routes", async () => {
      routesApi.add({
        name: "route1",
        path: "/route1",
        canActivate: () => () => false,
      });
      routesApi.add({
        name: "route2",
        path: "/route2",
        canActivate: () => () => false,
      });
      router.addDeactivateGuard("home", () => () => false);

      routesApi.clear();

      // Re-add routes without guards
      routesApi.add({ name: "home", path: "/home" });
      routesApi.add({ name: "route1", path: "/route1" });
      routesApi.add({ name: "route2", path: "/route2" });

      // All navigations should work (all guards were cleared)
      await router.navigate("home");
      await router.navigate("route1");
      await router.navigate("route2");

      expect(router.getState()?.name).toBe("route2");
    });
  });

  describe("preserves non-route state", () => {
    it("should preserve plugins", async () => {
      const pluginCalls: string[] = [];
      const plugin = () => ({
        onTransitionStart: () => {
          pluginCalls.push("start");
        },
      });

      router.usePlugin(plugin);

      routesApi.clear();

      // Add route and navigate to verify plugin is still active
      routesApi.add({ name: "test", path: "/test" });
      await router.navigate("test");

      // Plugin should have been called (proving it's still registered)
      expect(pluginCalls).toContain("start");
    });

    it("should preserve middleware", async () => {
      const middlewareCalls: string[] = [];

      router.usePlugin(() => ({
        onTransitionSuccess: () => {
          middlewareCalls.push("mw");
        },
      }));

      routesApi.clear();

      // Add route and navigate to verify plugin is still active
      routesApi.add({ name: "test", path: "/test" });
      await router.navigate("test");

      // Plugin should have been called (proving it's still registered)
      expect(middlewareCalls).toContain("mw");
    });

    it("should preserve dependencies", async () => {
      interface TestDeps {
        api: { fetch: () => void };
      }
      const typedRouter = router as Router<TestDeps>;

      const deps = getDependenciesApi(typedRouter);

      deps.set("api", { fetch: () => {} });

      getRoutesApi(typedRouter).clear();

      expect(deps.has("api")).toBe(true);
    });

    it("should preserve options", async () => {
      // Options set before start are preserved
      const options = getPluginApi(router).getOptions();

      routesApi.clear();

      // Options should be the same after clearRoutes
      expect(getPluginApi(router).getOptions().trailingSlash).toBe(
        options.trailingSlash,
      );
    });

    it("should preserve event listeners", async () => {
      const eventLog: string[] = [];

      getPluginApi(router).addEventListener(events.TRANSITION_SUCCESS, () => {
        eventLog.push("success");
      });

      routesApi.clear();

      // Add a route and navigate to verify listener is preserved
      routesApi.add({ name: "test", path: "/test" });
      await router.navigate("test");

      // Listener should fire after navigation
      expect(eventLog).toContain("success");
    });
  });

  describe("state after clearRoutes - edge cases", () => {
    it("should clear state to undefined after clearRoutes", async () => {
      // Navigate to a route first
      await router.navigate("users.list");

      expect(router.getState()?.name).toBe("users.list");

      // Clear all routes
      routesApi.clear();

      // State should be cleared to undefined
      expect(router.getState()).toBeUndefined();

      // Route doesn't exist in tree anymore
      expect(getPluginApi(router).matchPath("/home")).toBeUndefined();
    });

    it("should have consistent state - both state and matchPath are undefined", async () => {
      await router.navigate("users.list");

      const currentState = router.getState();

      expect(currentState?.name).toBe("users.list");
      expect(currentState?.path).toBe("/users/list");

      routesApi.clear();

      // State is cleared
      expect(router.getState()).toBeUndefined();

      // matchPath also returns undefined - consistent!
      expect(getPluginApi(router).matchPath("/users/list")).toBeUndefined();
    });

    it("should return cancel function when navigating to non-existent route", async () => {
      routesApi.clear();

      // Navigation to non-existent route returns cancel function (noop)
      // This is current behavior - navigate returns cancel function when route not found
      const result = router.navigate("home");

      expect(result).toBeInstanceOf(Promise);
      await expect(result).rejects.toThrowError();
    });

    it("should transition to new route after clearRoutes + addRoute", async () => {
      await router.navigate("users.list");

      routesApi.clear();
      routesApi.add({ name: "dashboard", path: "/dashboard" });

      // Navigate to new route - this works because addRoute registered the route
      // Note: navigate returns synchronously when state update is immediate
      await router.navigate("dashboard");

      expect(router.getState()?.name).toBe("dashboard");
    });

    it("should successfully navigate to new route after clearRoutes + addRoute", async () => {
      // This is the intended workflow for route replacement
      routesApi.clear();
      routesApi.add({ name: "newRoute", path: "/new" });

      await router.navigate("newRoute");

      // Navigation should work - state is updated
      expect(router.getState()?.name).toBe("newRoute");
    });
  });

  describe("chaining patterns", () => {
    it("should support clear-then-add pattern", async () => {
      routesApi.clear();
      routesApi.add([
        { name: "home", path: "/" },
        { name: "about", path: "/about" },
        { name: "contact", path: "/contact" },
      ]);

      expect(getPluginApi(router).matchPath("/")?.name).toBe("home");
      expect(getPluginApi(router).matchPath("/about")?.name).toBe("about");
      expect(getPluginApi(router).matchPath("/contact")?.name).toBe("contact");
    });

    it("should support complete route replacement", async () => {
      // Original routes
      routesApi.add({ name: "oldRoute", path: "/old" });

      // Replace all routes
      routesApi.clear();
      routesApi.add({ name: "newRoute", path: "/new" });

      expect(getPluginApi(router).matchPath("/old")).toBeUndefined();
      expect(getPluginApi(router).matchPath("/new")?.name).toBe("newRoute");
    });
  });

  describe("blocking during navigation", () => {
    let errorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(async () => {
      errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});
    });

    afterEach(() => {
      errorSpy.mockRestore();
    });

    it("should block clearRoutes during async navigation", async () => {
      let resolveCanActivate: () => void;

      routesApi.add({
        name: "asyncRoute",
        path: "/async-route",
        canActivate: () => () =>
          new Promise<boolean>((resolve) => {
            resolveCanActivate = () => {
              resolve(true);
            };
          }),
      });

      // Start navigation (async)
      const navigationPromise = router
        .navigate("asyncRoute")
        .then(() => true)
        .catch(() => false);

      // Give time for navigation to start
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Try to clear during navigation - should be blocked
      routesApi.clear();

      // Should log error
      expect(errorSpy).toHaveBeenCalledWith(
        "router.clearRoutes",
        expect.stringContaining("navigation is in progress"),
      );

      // Routes should NOT be cleared (operation was blocked)
      expect(getPluginApi(router).matchPath("/home")).toBeDefined();
      expect(getPluginApi(router).matchPath("/async-route")).toBeDefined();

      // Resolve the canActivate to complete navigation
      resolveCanActivate!();
      const result = await navigationPromise;

      expect(result).toBe(true);
      expect(router.getState()?.name).toBe("asyncRoute");
    });

    it("should clear routes even when blocked by pending navigation", async () => {
      let resolveCanActivate: () => void;

      routesApi.add({
        name: "slowRoute",
        path: "/slow",
        canActivate: () => () =>
          new Promise<boolean>((resolve) => {
            resolveCanActivate = () => {
              resolve(true);
            };
          }),
      });

      // Start navigation (fire-and-forget — guard holds it in progress)
      const navigationPromise = router
        .navigate("slowRoute")
        .then(() => true)
        .catch(() => false);

      // Give time for navigation to start
      await new Promise((resolve) => setTimeout(resolve, 10));

      // clearRoutes should work even when blocked
      routesApi.clear();

      // Cleanup — resolve guard and await navigation
      resolveCanActivate!();
      const result = await navigationPromise;

      expect(result).toBe(true);
    });

    it("should allow clearRoutes after navigation completes", async () => {
      let resolveCanActivate: () => void;

      routesApi.add({
        name: "tempRoute",
        path: "/temp",
        canActivate: () => () =>
          new Promise<boolean>((resolve) => {
            resolveCanActivate = () => {
              resolve(true);
            };
          }),
      });

      // Start navigation
      const navigationPromise = router
        .navigate("tempRoute")
        .then(() => undefined);

      // Give time for navigation to start
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Navigation in progress - clearRoutes blocked
      routesApi.clear();

      expect(errorSpy).toHaveBeenCalled();
      expect(getPluginApi(router).matchPath("/temp")).toBeDefined();

      // Complete navigation
      resolveCanActivate!();
      await navigationPromise;

      // Reset spy to check next call
      errorSpy.mockClear();

      // Now navigation is complete (callback was called) - clearRoutes should work
      routesApi.clear();

      // Should NOT log error this time
      expect(errorSpy).not.toHaveBeenCalled();

      // Routes should be cleared
      expect(getPluginApi(router).matchPath("/temp")).toBeUndefined();
      expect(router.getState()).toBeUndefined();
    });

    it("should not affect other router instances", async () => {
      const router2 = createTestRouter();

      await router2.start("/home");

      let resolveCanActivate: () => void;

      routesApi.add({
        name: "asyncRoute",
        path: "/async",
        canActivate: () => () =>
          new Promise<boolean>((resolve) => {
            resolveCanActivate = () => {
              resolve(true);
            };
          }),
      });

      // Start navigation on router1 (fire-and-forget — guard holds it in progress)
      const navigationPromise = router
        .navigate("asyncRoute")
        .then(() => true)
        .catch(() => false);

      // Give time for navigation to start
      await new Promise((resolve) => setTimeout(resolve, 10));

      // clearRoutes on router2 should work (it's not navigating)
      getRoutesApi(router2).clear();

      // router2 should be cleared
      expect(getPluginApi(router2).matchPath("/home")).toBeUndefined();

      // router1 should be blocked
      routesApi.clear();

      expect(errorSpy).toHaveBeenCalledWith(
        "router.clearRoutes",
        expect.stringContaining("navigation is in progress"),
      );

      // router1 routes should NOT be cleared
      expect(getPluginApi(router).matchPath("/home")).toBeDefined();

      // Cleanup — resolve guard and await navigation
      resolveCanActivate!();
      await navigationPromise;
      router2.stop();
    });
  });

  describe("router lifecycle states", () => {
    it("should work on router that was never started", async () => {
      // Create router without calling start()
      const unstartedRouter = createTestRouter();

      // clearRoutes should work before start()
      getRoutesApi(unstartedRouter).clear();

      // All routes should be cleared
      expect(getPluginApi(unstartedRouter).matchPath("/")).toBeUndefined();
      expect(getPluginApi(unstartedRouter).matchPath("/home")).toBeUndefined();

      // Should still be able to add new routes
      getRoutesApi(unstartedRouter).add({ name: "fresh", path: "/fresh" });

      expect(getPluginApi(unstartedRouter).matchPath("/fresh")?.name).toBe(
        "fresh",
      );
    });

    it("should work on stopped router", async () => {
      // Navigate to a route first
      await router.navigate("users.list");

      expect(router.getState()?.name).toBe("users.list");

      // Stop the router
      router.stop();

      // clearRoutes should work after stop()
      routesApi.clear();

      // All routes should be cleared
      expect(getPluginApi(router).matchPath("/")).toBeUndefined();
      expect(getPluginApi(router).matchPath("/home")).toBeUndefined();
      expect(router.getState()).toBeUndefined();

      // Should still be able to add new routes
      routesApi.add({ name: "newRoute", path: "/new" });

      expect(getPluginApi(router).matchPath("/new")?.name).toBe("newRoute");
    });

    it("should work correctly with stop-start-stop cycle", async () => {
      // First cycle
      await router.navigate("users.list");

      expect(router.getState()?.name).toBe("users.list");

      router.stop();
      routesApi.clear();

      // Routes cleared
      expect(getPluginApi(router).matchPath("/home")).toBeUndefined();

      // Can add new routes and restart with new defaultRoute
      // Issue #50: With two-phase start, we need a new router with new defaultRoute
      // since the old defaultRoute ("home") no longer exists and setOption is removed
      router = createTestRouter({ defaultRoute: "dashboard" });
      routesApi = getRoutesApi(router);
      routesApi.add({ name: "dashboard", path: "/dashboard" });
      await router.start("/dashboard");

      expect(router.getState()?.name).toBe("dashboard");

      // Stop again and clear
      router.stop();
      routesApi.clear();

      expect(getPluginApi(router).matchPath("/dashboard")).toBeUndefined();
    });
  });

  describe("forwardFnMap cleanup", () => {
    it("should clear forwardFnMap entries on clearRoutes", async () => {
      routesApi.add({ name: "fn-dest", path: "/fn-dest" });
      routesApi.add({
        name: "fn-src",
        path: "/fn-src",
        forwardTo: () => "fn-dest",
      });

      expect(getPluginApi(router).forwardState("fn-src", {}).name).toBe(
        "fn-dest",
      );

      routesApi.clear();

      // Re-add routes without forwardTo — should NOT have old dynamic forward
      routesApi.add([
        { name: "fn-dest", path: "/fn-dest" },
        { name: "fn-src", path: "/fn-src" },
      ]);

      expect(getPluginApi(router).forwardState("fn-src", {}).name).toBe(
        "fn-src",
      );
    });
  });
});
