import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { createRouter, errorCodes } from "@real-router/core";
import {
  getLifecycleApi,
  getPluginApi,
  getRoutesApi,
} from "@real-router/core/api";

import { createTestRouter } from "../../../helpers";

import type { ParamsSearch, Router, RouterError } from "@real-router/core";
import type { LifecycleApi, RoutesApi } from "@real-router/core/api";

let router: Router;
let routesApi: RoutesApi;
let lifecycle: LifecycleApi;

describe("core/routes/removeRoute", () => {
  beforeEach(async () => {
    router = createTestRouter();
    routesApi = getRoutesApi(router);
    lifecycle = getLifecycleApi(router);
    await router.start("/home");
  });

  afterEach(() => {
    router.stop();
  });

  describe("full route removal", () => {
    it("should remove route from tree (matchPath returns undefined)", async () => {
      routesApi.add({ name: "temporary", path: "/temporary" });

      // Route exists before removal
      expect(getPluginApi(router).matchPath("/temporary")?.name).toBe(
        "temporary",
      );

      routesApi.remove("temporary");

      // Route should not match after removal
      expect(getPluginApi(router).matchPath("/temporary")).toBeUndefined();
    });

    it("should remove route so buildPath throws", async () => {
      routesApi.add({ name: "removable", path: "/removable" });

      // Route exists before removal
      expect(router.buildPath("removable")).toBe("/removable");

      routesApi.remove("removable");

      // buildPath should throw for non-existent route
      expect(() => router.buildPath("removable")).toThrow(/not defined/);
    });

    it("should allow re-adding route with same name after removal", async () => {
      routesApi.add({ name: "reusable", path: "/old-path" });
      routesApi.remove("reusable");

      // Should not throw - route was fully removed
      expect(() => {
        routesApi.add({ name: "reusable", path: "/new-path" });
      }).not.toThrow();

      expect(getPluginApi(router).matchPath("/new-path")?.name).toBe(
        "reusable",
      );
      expect(getPluginApi(router).matchPath("/old-path")).toBeUndefined();
    });

    it("should remove route with children", async () => {
      routesApi.add({
        name: "parent",
        path: "/parent",
        children: [
          { name: "child1", path: "/child1" },
          { name: "child2", path: "/child2" },
        ],
      });

      expect(getPluginApi(router).matchPath("/parent/child1")?.name).toBe(
        "parent.child1",
      );

      routesApi.remove("parent");

      expect(getPluginApi(router).matchPath("/parent")).toBeUndefined();
      expect(getPluginApi(router).matchPath("/parent/child1")).toBeUndefined();
      expect(getPluginApi(router).matchPath("/parent/child2")).toBeUndefined();
    });

    it("should remove only specified child route", async () => {
      routesApi.add({
        name: "category",
        path: "/category",
        children: [
          { name: "keep", path: "/keep" },
          { name: "remove", path: "/remove" },
        ],
      });

      routesApi.remove("category.remove");

      // Parent and sibling should still exist
      expect(getPluginApi(router).matchPath("/category")?.name).toBe(
        "category",
      );
      expect(getPluginApi(router).matchPath("/category/keep")?.name).toBe(
        "category.keep",
      );

      // Removed child should not exist
      expect(
        getPluginApi(router).matchPath("/category/remove"),
      ).toBeUndefined();
    });

    it("should handle removal of non-existent route gracefully", async () => {
      // Route doesn't exist - remove should not throw
      expect(() => {
        routesApi.remove("nonexistent");
      }).not.toThrow();

      // Router should still function normally
      expect(getPluginApi(router).matchPath("/")).toBeDefined();
    });

    it("should handle multiple removals of the same route gracefully (12.13)", async () => {
      // Add a route
      routesApi.add({ name: "temporary", path: "/temporary" });

      expect(getPluginApi(router).matchPath("/temporary")?.name).toBe(
        "temporary",
      );

      // First removal - should succeed
      routesApi.remove("temporary");

      expect(getPluginApi(router).matchPath("/temporary")).toBeUndefined();

      // Second removal - should be graceful (warning, no throw)
      routesApi.remove("temporary");

      // Third removal - still graceful
      routesApi.remove("temporary");

      // Router should still function normally
      expect(getPluginApi(router).matchPath("/")).toBeDefined();
    });

    it("should handle removal of non-existent child route gracefully", async () => {
      routesApi.add({
        name: "wrapper",
        path: "/wrapper",
        children: [{ name: "exists", path: "/exists" }],
      });

      // Child doesn't exist - should not throw
      expect(() => {
        routesApi.remove("wrapper.nonexistent");
      }).not.toThrow();

      // Parent and existing child should remain
      expect(getPluginApi(router).matchPath("/wrapper")?.name).toBe("wrapper");
      expect(getPluginApi(router).matchPath("/wrapper/exists")?.name).toBe(
        "wrapper.exists",
      );
    });
  });

  describe("lifecycle cleanup", () => {
    it("should clear canActivate handler on removeRoute", async () => {
      const guard = vi.fn().mockReturnValue(false);

      routesApi.add({
        name: "protected",
        path: "/protected",
        canActivate: () => guard,
      });

      // Verify guard works before removal - navigation should be blocked
      try {
        await router.navigate("protected");

        expect.fail("Should have thrown");
      } catch (error) {
        expect((error as RouterError).code).toBe(errorCodes.CANNOT_ACTIVATE);
        expect(guard).toHaveBeenCalled();
      }

      routesApi.remove("protected");

      // After removal, route no longer exists
      expect(routesApi.has("protected")).toBe(false);
      expect(getPluginApi(router).matchPath("/protected")).toBeUndefined();
    });

    it("should clear canDeactivate handler on removeRoute", async () => {
      const guard = vi.fn().mockReturnValue(false);

      routesApi.add({ name: "editor", path: "/editor" });
      lifecycle.addDeactivateGuard("editor", () => guard);

      // Navigate to editor first
      await router.navigate("editor");

      // Verify guard works - leaving should be blocked
      try {
        await router.navigate("home");

        expect.fail("Should have thrown");
      } catch (error) {
        expect((error as RouterError).code).toBe(errorCodes.CANNOT_DEACTIVATE);
        expect(guard).toHaveBeenCalled();
      }

      // Navigate back to home for clean state
      guard.mockReturnValue(true);
      await router.navigate("home");
      guard.mockClear();

      routesApi.remove("editor");

      // After removal, route no longer exists
      expect(routesApi.has("editor")).toBe(false);
    });

    it("should only clear canDeactivate for removed route", async () => {
      const guard1 = vi.fn().mockReturnValue(false);
      const guard2 = vi.fn().mockReturnValue(false);

      routesApi.add({ name: "form1", path: "/form1" });
      routesApi.add({ name: "form2", path: "/form2" });
      lifecycle.addDeactivateGuard("form1", () => guard1);
      lifecycle.addDeactivateGuard("form2", () => guard2);

      routesApi.remove("form1");

      // form1 no longer exists
      expect(routesApi.has("form1")).toBe(false);

      // form2 guard should still work - verify by navigation
      await router.navigate("form2");

      try {
        await router.navigate("home");

        expect.fail("Should have thrown");
      } catch (error) {
        expect((error as RouterError).code).toBe(errorCodes.CANNOT_DEACTIVATE);
        expect(guard2).toHaveBeenCalled();
      }
    });

    it("should clear both canActivate and canDeactivate handlers", async () => {
      routesApi.add({
        name: "dashboard",
        path: "/dashboard",
        canActivate: () => () => true,
      });
      lifecycle.addDeactivateGuard("dashboard", () => () => true);

      routesApi.remove("dashboard");

      // After removal, route no longer exists
      expect(routesApi.has("dashboard")).toBe(false);
      expect(getPluginApi(router).matchPath("/dashboard")).toBeUndefined();
    });

    it("should not throw when route has no lifecycle handlers", async () => {
      routesApi.add({ name: "simple", path: "/simple" });

      expect(() => {
        routesApi.remove("simple");
      }).not.toThrow();
    });

    it("should not emit warning when clearing non-existent lifecycle handlers", async () => {
      routesApi.add({ name: "nohandlers", path: "/nohandlers" });

      // The silent parameter should suppress warnings
      expect(() => {
        routesApi.remove("nohandlers");
      }).not.toThrow();

      // Route should be removed
      expect(routesApi.has("nohandlers")).toBe(false);
    });
  });

  describe("config cleanup", () => {
    it("should clear decoders on removeRoute", async () => {
      const decodeParams = vi.fn(({ params, search }) => ({
        params: { ...params, id: Number(params.id) },
        search,
      }));

      routesApi.add({
        name: "withDecoder",
        path: "/with-decoder/:id",
        decodeParams,
      });

      // Verify decoder works before removal
      expect(
        getPluginApi(router).matchPath("/with-decoder/123")?.params.id,
      ).toBe(123);

      routesApi.remove("withDecoder");

      // Route no longer exists
      expect(routesApi.has("withDecoder")).toBe(false);
      expect(
        getPluginApi(router).matchPath("/with-decoder/123"),
      ).toBeUndefined();
    });

    it("should clear encoders on removeRoute", async () => {
      const encodeParams = vi.fn(({ params, search }) => ({
        params: { ...params, id: `${params.id as number}` },
        search,
      }));

      routesApi.add({
        name: "decoded",
        path: "/decoded/:id",
        encodeParams,
      });

      // Verify encoder works before removal
      router.buildPath("decoded", { id: 123 });

      expect(encodeParams).toHaveBeenCalled();

      routesApi.remove("decoded");

      // Route no longer exists
      expect(routesApi.has("decoded")).toBe(false);
    });

    it("should clear defaultParams on removeRoute", async () => {
      routesApi.add({
        name: "withdefaults",
        path: "/withdefaults",
        defaultParams: { page: 1 },
      });

      // Verify defaults work before removal
      expect(
        getPluginApi(router).makeState("withdefaults").params,
      ).toStrictEqual({
        page: 1,
      });

      routesApi.remove("withdefaults");

      // Route no longer exists
      expect(routesApi.has("withdefaults")).toBe(false);
    });

    it("should clear forwardMap on removeRoute", async () => {
      routesApi.add({ name: "target", path: "/target" });
      routesApi.add({
        name: "redirect",
        path: "/redirect",
        forwardTo: "target",
      });

      // Verify forward works before removal
      expect(getPluginApi(router).forwardState("redirect", {}).name).toBe(
        "target",
      );

      routesApi.remove("redirect");

      // Route no longer exists
      expect(routesApi.has("redirect")).toBe(false);
    });

    it("should only clear forwardMap for removed route", async () => {
      routesApi.add({ name: "dest", path: "/dest" });
      routesApi.add({ name: "fwd1", path: "/fwd1", forwardTo: "dest" });
      routesApi.add({ name: "fwd2", path: "/fwd2", forwardTo: "dest" });

      // Both forward rules work
      expect(getPluginApi(router).forwardState("fwd1", {}).name).toBe("dest");
      expect(getPluginApi(router).forwardState("fwd2", {}).name).toBe("dest");

      routesApi.remove("fwd1");

      // fwd1 is removed, fwd2 still works
      expect(routesApi.has("fwd1")).toBe(false);
      expect(getPluginApi(router).forwardState("fwd2", {}).name).toBe("dest");
    });

    it("should clear child route forwardMap when parent removed", async () => {
      routesApi.add({ name: "dest", path: "/dest" });
      routesApi.add({
        name: "container",
        path: "/container",
        children: [{ name: "fwd", path: "/fwd", forwardTo: "dest" }],
      });

      // Verify child forward works
      expect(getPluginApi(router).forwardState("container.fwd", {}).name).toBe(
        "dest",
      );

      routesApi.remove("container");

      // Parent and child routes no longer exist
      expect(routesApi.has("container")).toBe(false);
      expect(routesApi.has("container.fwd")).toBe(false);
    });

    it("should clear child route handlers when parent removed", async () => {
      const guard = vi.fn().mockReturnValue(false);

      routesApi.add({
        name: "area",
        path: "/area",
        children: [{ name: "page", path: "/page" }],
      });
      lifecycle.addDeactivateGuard("area.page", () => guard);

      // Verify guard works before removal
      await router.navigate("area.page");

      try {
        await router.navigate("home");

        expect.fail("Should have thrown");
      } catch (error) {
        expect((error as RouterError).code).toBe(errorCodes.CANNOT_DEACTIVATE);
        expect(guard).toHaveBeenCalled();
      }

      // Navigate back to home
      guard.mockReturnValue(true);
      await router.navigate("home");

      routesApi.remove("area");

      // Parent and child no longer exist
      expect(routesApi.has("area")).toBe(false);
      expect(routesApi.has("area.page")).toBe(false);
    });

    it("should remove route with dynamic forwardTo", async () => {
      routesApi.add({ name: "fn-target", path: "/fn-target" });
      routesApi.add({
        name: "fn-forward",
        path: "/fn-forward",
        forwardTo: () => "fn-target",
      });

      expect(getPluginApi(router).forwardState("fn-forward", {}).name).toBe(
        "fn-target",
      );

      const fnForwardRoute = routesApi.get("fn-forward");

      expect(typeof fnForwardRoute?.forwardTo).toBe("function");

      routesApi.remove("fn-forward");

      expect(routesApi.has("fn-forward")).toBe(false);
    });

    it("should not leak forwardFnMap entry after removeRoute and re-add", async () => {
      routesApi.add({ name: "re-target", path: "/re-target" });
      routesApi.add({
        name: "re-forward",
        path: "/re-forward",
        forwardTo: () => "re-target",
      });

      expect(getPluginApi(router).forwardState("re-forward", {}).name).toBe(
        "re-target",
      );

      routesApi.remove("re-forward");

      // Re-add without forwardTo — should NOT have old dynamic forward
      routesApi.add({ name: "re-forward", path: "/re-forward" });

      expect(getPluginApi(router).forwardState("re-forward", {}).name).toBe(
        "re-forward",
      );
    });

    it("should clear child forwardFnMap when parent removed", async () => {
      routesApi.add({ name: "fn-dest", path: "/fn-dest" });
      routesApi.add({
        name: "fn-parent",
        path: "/fn-parent",
        children: [
          { name: "child", path: "/child", forwardTo: () => "fn-dest" },
        ],
      });

      // Verify child forward works
      expect(
        getPluginApi(router).forwardState("fn-parent.child", {}).name,
      ).toBe("fn-dest");

      // Remove parent — child forwardFnMap should be cleared
      routesApi.remove("fn-parent");

      // Re-add without forwardTo
      routesApi.add({
        name: "fn-parent",
        path: "/fn-parent",
        children: [{ name: "child", path: "/child" }],
      });

      expect(
        getPluginApi(router).forwardState("fn-parent.child", {}).name,
      ).toBe("fn-parent.child");
    });
  });

  describe("early exit optimization (non-existent route)", () => {
    /**
     * These tests verify the fix for: the definitions splice reported whether
     * it found anything and the answer was ignored, causing an O(N)
     * rebuildTree even for a name that is not a route.
     *
     * After fix: early return with a warning when the route is not found. The
     * splice reports the removed NAMES now (`spliceSubtree`, #1757); absent is
     * still `undefined` and still short-circuits here.
     */

    it("should log warning when removing non-existent route", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      routesApi.remove("nonexistent");

      expect(warnSpy).toHaveBeenCalledWith(
        '[router.removeRoute] Route "nonexistent" not found. No changes made.',
      );

      warnSpy.mockRestore();
    });

    it("should log warning when removing non-existent child route", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      routesApi.add({
        name: "parent",
        path: "/parent",
        children: [{ name: "exists", path: "/exists" }],
      });

      routesApi.remove("parent.nonexistent");

      expect(warnSpy).toHaveBeenCalledWith(
        '[router.removeRoute] Route "parent.nonexistent" not found. No changes made.',
      );

      warnSpy.mockRestore();
    });

    it("should NOT modify existing routes when removing non-existent route", async () => {
      const activateGuard = vi.fn().mockReturnValue(false);
      const deactivateGuard = vi.fn().mockReturnValue(false);

      // Setup: add routes with various configurations
      routesApi.add({
        name: "existing",
        path: "/existing/:id",
        defaultParams: { id: "1" },
        decodeParams: ({ params, search }) => ({
          params: { ...params, id: Number(params.id) },
          search,
        }),
        encodeParams: ({ params, search }) => ({
          params: { ...params, id: `${params.id as number}` },
          search,
        }),
        canActivate: () => activateGuard,
      });
      lifecycle.addDeactivateGuard("existing", () => deactivateGuard);

      // Attempt to remove non-existent route
      routesApi.remove("nonexistent");

      // Verify route still works (behavioral test)
      expect(getPluginApi(router).matchPath("/existing/42")?.name).toBe(
        "existing",
      );
      expect(router.buildPath("existing", { id: 99 })).toBe("/existing/99");
      expect(getPluginApi(router).makeState("existing").params).toStrictEqual({
        id: "1",
      });

      // Verify canActivate guard still works
      try {
        await router.navigate("existing");

        expect.fail("Should have thrown");
      } catch (error) {
        expect((error as RouterError).code).toBe(errorCodes.CANNOT_ACTIVATE);
        expect(activateGuard).toHaveBeenCalled();
      }

      activateGuard.mockClear();
      activateGuard.mockReturnValue(true);

      // Verify canDeactivate guard still works
      await router.navigate("existing");

      try {
        await router.navigate("home");

        expect.fail("Should have thrown");
      } catch (error) {
        expect((error as RouterError).code).toBe(errorCodes.CANNOT_DEACTIVATE);
        expect(deactivateGuard).toHaveBeenCalled();
      }
    });

    it("should handle removal of nonexistent route gracefully", async () => {
      routesApi.remove("nonexistent");

      expect(routesApi.has("nonexistent")).toBe(false);
    });
  });

  describe("active route protection", () => {
    /**
     * Tests for blocking removal of currently active route.
     * Prevents inconsistent state where router.getState() points to non-existent route.
     */

    it("should block removal of currently active route with warning", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      routesApi.add({ name: "dashboard", path: "/dashboard" });
      await router.navigate("dashboard");

      // Verify we're on the route
      expect(router.getState()?.name).toBe("dashboard");

      // Attempt to remove active route
      routesApi.remove("dashboard");

      // Should warn and NOT remove
      expect(warnSpy).toHaveBeenCalledWith(
        '[router.removeRoute] Cannot remove route "dashboard" — it is currently active. Navigate away first.',
      );

      // Route should still exist
      expect(getPluginApi(router).matchPath("/dashboard")?.name).toBe(
        "dashboard",
      );

      warnSpy.mockRestore();
    });

    it("should block removal of parent when child is active", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      routesApi.add({
        name: "parentRoute",
        path: "/parent-route",
        children: [{ name: "childRoute", path: "/child" }],
      });
      await router.navigate("parentRoute.childRoute");

      // Verify we're on the child route
      expect(router.getState()?.name).toBe("parentRoute.childRoute");

      // Attempt to remove parent
      routesApi.remove("parentRoute");

      // Should warn with current route info
      expect(warnSpy).toHaveBeenCalledWith(
        '[router.removeRoute] Cannot remove route "parentRoute" — it is currently active (current: "parentRoute.childRoute"). Navigate away first.',
      );

      // Parent and child should still exist
      expect(getPluginApi(router).matchPath("/parent-route")?.name).toBe(
        "parentRoute",
      );
      expect(getPluginApi(router).matchPath("/parent-route/child")?.name).toBe(
        "parentRoute.childRoute",
      );

      warnSpy.mockRestore();
    });

    it("should allow removal of inactive route when another route is active", async () => {
      routesApi.add({ name: "active", path: "/active" });
      routesApi.add({ name: "inactive", path: "/inactive" });
      await router.navigate("active");

      // Should work - removing inactive route
      routesApi.remove("inactive");

      // Active route still exists, inactive removed
      expect(getPluginApi(router).matchPath("/active")?.name).toBe("active");
      expect(getPluginApi(router).matchPath("/inactive")).toBeUndefined();
    });

    it("should allow removal of sibling route when on different branch", async () => {
      routesApi.add({
        name: "sectionTest",
        path: "/section-test",
        children: [
          { name: "pageA", path: "/a" },
          { name: "pageB", path: "/b" },
        ],
      });
      await router.navigate("sectionTest.pageA");

      // Should work - removing sibling
      routesApi.remove("sectionTest.pageB");

      // pageA still exists, pageB removed
      expect(getPluginApi(router).matchPath("/section-test/a")?.name).toBe(
        "sectionTest.pageA",
      );
      expect(getPluginApi(router).matchPath("/section-test/b")).toBeUndefined();
    });

    it("should allow removal when router has no active state", async () => {
      // Stop router to clear state
      router.stop();

      routesApi.add({ name: "test", path: "/test" });

      // Should work - no active state
      routesApi.remove("test");

      expect(getPluginApi(router).matchPath("/test")).toBeUndefined();
    });

    it("should allow removal when router not started", async () => {
      // Create fresh router without starting
      const freshRouter = createTestRouter();
      const freshRoutesApi = getRoutesApi(freshRouter);

      freshRoutesApi.add({ name: "temp", path: "/temp" });

      // Should work - router not started
      freshRoutesApi.remove("temp");

      expect(getPluginApi(freshRouter).matchPath("/temp")).toBeUndefined();
    });

    it("should return undefined when removal blocked", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      routesApi.add({ name: "blocked", path: "/blocked" });
      await router.navigate("blocked");

      routesApi.remove("blocked");

      // Should warn when blocked
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("currently active"),
      );

      warnSpy.mockRestore();
    });
  });

  describe("edge cases - critical scenarios", () => {
    /**
     * Tests for edge cases 12.2-12.3 from remove-route-analysis.md
     * These are critical scenarios involving forwardTo and async navigation
     */

    // 12.2: Removing forwardTo target route
    describe("forwardTo target removal (12.2)", () => {
      it("should clear forwardMap entry when target route is removed", async () => {
        routesApi.add({ name: "newDashboard", path: "/new-dashboard" });
        routesApi.add({
          name: "oldDashboard",
          path: "/old-dashboard",
          forwardTo: "newDashboard",
        });

        // Verify forward works
        expect(getPluginApi(router).forwardState("oldDashboard", {}).name).toBe(
          "newDashboard",
        );

        // Remove the target route
        routesApi.remove("newDashboard");

        // Forward should no longer redirect (target removed)
        expect(getPluginApi(router).forwardState("oldDashboard", {}).name).toBe(
          "oldDashboard",
        );
      });

      it("should keep source route functional after target removal", async () => {
        routesApi.add({ name: "targetRoute", path: "/target" });
        routesApi.add({
          name: "sourceRoute",
          path: "/source",
          forwardTo: "targetRoute",
        });

        routesApi.remove("targetRoute");

        // Source route should still exist and be matchable
        expect(getPluginApi(router).matchPath("/source")?.name).toBe(
          "sourceRoute",
        );
      });

      it("should allow navigation to source route after target removal", async () => {
        routesApi.add({
          name: "forwardTarget",
          path: "/forward-target",
        });
        routesApi.add({
          name: "forwardSource",
          path: "/forward-source",
          forwardTo: "forwardTarget",
        });

        routesApi.remove("forwardTarget");

        // Navigation to source should work (no forward happens)
        await router.navigate("forwardSource");

        expect(router.getState()?.name).toBe("forwardSource");
      });

      it("should handle chain of forwardTo when middle target is removed", async () => {
        routesApi.add({ name: "final", path: "/final" });
        routesApi.add({
          name: "middle",
          path: "/middle",
          forwardTo: "final",
        });
        routesApi.add({
          name: "start",
          path: "/start",
          forwardTo: "middle",
        });

        // Verify chain works: start -> middle -> final
        expect(getPluginApi(router).forwardState("start", {}).name).toBe(
          "final",
        );
        expect(getPluginApi(router).forwardState("middle", {}).name).toBe(
          "final",
        );

        // Remove middle route
        routesApi.remove("middle");

        // start's forward to middle should be cleared (middle no longer exists)
        expect(getPluginApi(router).forwardState("start", {}).name).toBe(
          "start",
        );
        // middle route no longer exists
        expect(routesApi.has("middle")).toBe(false);
        // final route should still exist
        expect(getPluginApi(router).matchPath("/final")?.name).toBe("final");
      });

      it("should clear forwardMap when source route is removed", async () => {
        routesApi.add({ name: "keepTarget", path: "/keep-target" });
        routesApi.add({
          name: "removeSource",
          path: "/remove-source",
          forwardTo: "keepTarget",
        });

        // Verify forward works
        expect(getPluginApi(router).forwardState("removeSource", {}).name).toBe(
          "keepTarget",
        );

        // Remove the source route
        routesApi.remove("removeSource");

        // Source route no longer exists
        expect(routesApi.has("removeSource")).toBe(false);
        // Target should still exist
        expect(getPluginApi(router).matchPath("/keep-target")?.name).toBe(
          "keepTarget",
        );
      });
    });

    // 12.3: Removal during active async navigation
    describe("removal during async navigation (12.3)", () => {
      it("should warn when removing route during active navigation", async () => {
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

        let resolveCanActivate: () => void;
        const canActivatePromise = new Promise<void>((resolve) => {
          resolveCanActivate = resolve;
        });

        routesApi.add({
          name: "asyncRoute",
          path: "/async-route",
          canActivate: () => async () => {
            await canActivatePromise;

            return true;
          },
        });

        // Start async navigation
        const navigationPromise = router.navigate("asyncRoute");

        // Give time for navigation to start
        await new Promise((resolve) => setTimeout(resolve, 10));

        // Try to remove during navigation - should warn but proceed
        routesApi.remove("asyncRoute");

        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining("navigation is in progress"),
        );

        // Route should be removed (we only warn, don't block)
        expect(getPluginApi(router).matchPath("/async-route")).toBeUndefined();

        // Resolve the canActivate
        resolveCanActivate!();

        // Navigation should fail because route was removed
        try {
          await navigationPromise;

          expect.fail("Should have thrown ROUTE_NOT_FOUND");
        } catch (error) {
          expect((error as RouterError).code).toBe(errorCodes.ROUTE_NOT_FOUND);
        }

        warnSpy.mockRestore();
      });

      it("should prevent removal when async navigation has completed", async () => {
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

        routesApi.add({
          name: "asyncComplete",
          path: "/async-complete",
          canActivate: () => async () => {
            await Promise.resolve();

            return true;
          },
        });

        // Complete navigation first
        await router.navigate("asyncComplete");

        // Now route is active
        expect(router.getState()?.name).toBe("asyncComplete");

        // Try to remove - should be blocked
        routesApi.remove("asyncComplete");

        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining("currently active"),
        );

        // Route should still exist
        expect(getPluginApi(router).matchPath("/async-complete")?.name).toBe(
          "asyncComplete",
        );

        warnSpy.mockRestore();
      });

      it("should warn when removing unrelated route during navigation", async () => {
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

        let resolveCanActivate: () => void;
        const canActivatePromise = new Promise<void>((resolve) => {
          resolveCanActivate = resolve;
        });

        routesApi.add({
          name: "navigatingTo",
          path: "/navigating-to",
          canActivate: () => async () => {
            await canActivatePromise;

            return true;
          },
        });
        routesApi.add({ name: "unrelated", path: "/unrelated" });

        // Start async navigation to navigatingTo
        const navigationPromise = router.navigate("navigatingTo");

        // Give time for navigation to start
        await new Promise((resolve) => setTimeout(resolve, 10));

        // Remove unrelated route during navigation - should warn but proceed
        routesApi.remove("unrelated");

        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining("navigation is in progress"),
        );

        // Route should be removed (we only warn, don't block)
        expect(getPluginApi(router).matchPath("/unrelated")).toBeUndefined();

        // Complete navigation
        resolveCanActivate!();
        const result = await navigationPromise;

        expect(result.name).toBe("navigatingTo");
        expect(router.getState()?.name).toBe("navigatingTo");

        warnSpy.mockRestore();
      });

      it("should handle rapid navigation + removal sequence", async () => {
        routesApi.add({ name: "rapid1", path: "/rapid1" });
        routesApi.add({ name: "rapid2", path: "/rapid2" });
        routesApi.add({ name: "rapid3", path: "/rapid3" });

        // Navigate to rapid1
        await router.navigate("rapid1");

        // Remove rapid2 (not current) - should work
        routesApi.remove("rapid2");

        expect(getPluginApi(router).matchPath("/rapid2")).toBeUndefined();

        // Navigate to rapid3
        await router.navigate("rapid3");

        // Now rapid1 can be removed (not current anymore)
        routesApi.remove("rapid1");

        expect(getPluginApi(router).matchPath("/rapid1")).toBeUndefined();
        expect(router.getState()?.name).toBe("rapid3");
      });
    });
  });

  describe("edge cases - boundary values", () => {
    /**
     * Tests for edge cases 12.4-12.10 from remove-route-analysis.md
     */

    // 12.4: Empty string as route name
    it("should handle empty string gracefully with warning", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      // Empty string is technically a valid route name in the type system
      // but no route has empty name in definitions
      routesApi.remove("");

      expect(warnSpy).toHaveBeenCalledWith(
        '[router.removeRoute] Route "" not found. No changes made.',
      );

      warnSpy.mockRestore();
    });

    // 12.5: Very long name (> 10000 characters)
    // MAX_ROUTE_NAME_LENGTH is 10,000 in type-guards package

    // 12.6: Exact boundary (10000 characters)
    it("should accept name with exactly 10000 characters", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const exactLimit = "a".repeat(10_000);

      // Should not throw - exactly 10000 is valid
      expect(() => {
        routesApi.remove(exactLimit);
      }).not.toThrow();

      // Route doesn't exist, so graceful handling
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("not found"),
      );

      warnSpy.mockRestore();
    });

    // 12.7: Unicode characters in name
    it("should handle unicode route names gracefully (no throw without plugin)", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      expect(() => {
        routesApi.remove("маршрут");
      }).not.toThrow();
      expect(() => {
        routesApi.remove("route_🚀");
      }).not.toThrow();

      warnSpy.mockRestore();
    });

    // 12.9: Deep nesting (10+ levels)
    it("should handle deeply nested route removal (15 levels)", async () => {
      // Build deeply nested route structure using Route type
      interface NestedRoute {
        name: string;
        path: string;
        children?: NestedRoute[];
      }
      const buildDeepRoute = (depth: number): NestedRoute => {
        if (depth === 0) {
          return { name: "leaf", path: "/leaf" };
        }

        return {
          name: `level${depth}`,
          path: `/level${depth}`,
          children: [buildDeepRoute(depth - 1)],
        };
      };

      const deepRoute = buildDeepRoute(14); // 15 levels total (0-14)

      routesApi.add(deepRoute as Parameters<typeof routesApi.add>[0]);

      // Verify deep route exists
      const deepPath =
        "/level14/level13/level12/level11/level10/level9/level8/level7/level6/level5/level4/level3/level2/level1/leaf";
      const deepName =
        "level14.level13.level12.level11.level10.level9.level8.level7.level6.level5.level4.level3.level2.level1.leaf";

      expect(getPluginApi(router).matchPath(deepPath)?.name).toBe(deepName);

      // Remove the deepest leaf
      routesApi.remove(deepName);

      expect(getPluginApi(router).matchPath(deepPath)).toBeUndefined();

      // Parent should still exist
      const parentPath =
        "/level14/level13/level12/level11/level10/level9/level8/level7/level6/level5/level4/level3/level2/level1";

      expect(getPluginApi(router).matchPath(parentPath)).toBeDefined();
    });

    it("should remove entire deep tree when removing root", async () => {
      interface NestedRoute {
        name: string;
        path: string;
        children?: NestedRoute[];
      }
      const buildDeepRoute = (depth: number): NestedRoute => {
        if (depth === 0) {
          return { name: "leaf", path: "/leaf" };
        }

        return {
          name: `deep${depth}`,
          path: `/deep${depth}`,
          children: [buildDeepRoute(depth - 1)],
        };
      };

      const deepRoute = buildDeepRoute(10);

      routesApi.add(deepRoute as Parameters<typeof routesApi.add>[0]);

      // Verify routes exist
      expect(getPluginApi(router).matchPath("/deep10")).toBeDefined();
      expect(
        getPluginApi(router).matchPath(
          "/deep10/deep9/deep8/deep7/deep6/deep5/deep4/deep3/deep2/deep1/leaf",
        ),
      ).toBeDefined();

      // Remove root - all children should be removed
      routesApi.remove("deep10");

      expect(getPluginApi(router).matchPath("/deep10")).toBeUndefined();
      expect(
        getPluginApi(router).matchPath(
          "/deep10/deep9/deep8/deep7/deep6/deep5/deep4/deep3/deep2/deep1/leaf",
        ),
      ).toBeUndefined();
    });

    // 12.10: Sequential removal of all routes
    it("should handle sequential removal of multiple routes", async () => {
      routesApi.add([
        { name: "routeA", path: "/route-a" },
        { name: "routeB", path: "/route-b" },
        { name: "routeC", path: "/route-c" },
      ]);

      expect(getPluginApi(router).matchPath("/route-a")).toBeDefined();
      expect(getPluginApi(router).matchPath("/route-b")).toBeDefined();
      expect(getPluginApi(router).matchPath("/route-c")).toBeDefined();

      routesApi.remove("routeA");

      expect(getPluginApi(router).matchPath("/route-a")).toBeUndefined();
      expect(getPluginApi(router).matchPath("/route-b")).toBeDefined();
      expect(getPluginApi(router).matchPath("/route-c")).toBeDefined();

      routesApi.remove("routeB");

      expect(getPluginApi(router).matchPath("/route-a")).toBeUndefined();
      expect(getPluginApi(router).matchPath("/route-b")).toBeUndefined();
      expect(getPluginApi(router).matchPath("/route-c")).toBeDefined();

      routesApi.remove("routeC");

      expect(getPluginApi(router).matchPath("/route-a")).toBeUndefined();
      expect(getPluginApi(router).matchPath("/route-b")).toBeUndefined();
      expect(getPluginApi(router).matchPath("/route-c")).toBeUndefined();
    });

    it("should allow adding routes after removing all custom routes", async () => {
      routesApi.add({ name: "temp1", path: "/temp1" });
      routesApi.add({ name: "temp2", path: "/temp2" });

      routesApi.remove("temp1");
      routesApi.remove("temp2");

      // Should be able to add new routes after clearing
      routesApi.add({ name: "new", path: "/new" });

      expect(getPluginApi(router).matchPath("/new")?.name).toBe("new");
    });
  });

  describe("edge cases - prototype pollution (12.17)", () => {
    /**
     * Tests for edge case 12.17 from remove-route-analysis.md
     * Verifies that prototype pollution attempts are handled safely
     */

    it("should handle __proto__ as route name gracefully", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      // __proto__ passes pattern validation [a-zA-Z_][a-zA-Z0-9_]*
      // but no such route exists in definitions
      routesApi.remove("__proto__");

      expect(warnSpy).toHaveBeenCalledWith(
        '[router.removeRoute] Route "__proto__" not found. No changes made.',
      );

      // Verify no prototype pollution occurred
      expect(Object.prototype.hasOwnProperty.call({}, "polluted")).toBe(false);

      warnSpy.mockRestore();
    });

    it("should handle constructor as route name gracefully", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      routesApi.remove("constructor");

      expect(warnSpy).toHaveBeenCalledWith(
        '[router.removeRoute] Route "constructor" not found. No changes made.',
      );

      warnSpy.mockRestore();
    });

    it("should handle prototype as route name gracefully", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      routesApi.remove("prototype");

      expect(warnSpy).toHaveBeenCalledWith(
        '[router.removeRoute] Route "prototype" not found. No changes made.',
      );

      warnSpy.mockRestore();
    });

    it("should not affect Object.prototype when removing __proto__", async () => {
      const originalKeys = Object.keys(Object.prototype);

      routesApi.remove("__proto__");

      // Object.prototype should be unchanged
      expect(Object.keys(Object.prototype)).toStrictEqual(originalKeys);
    });

    it("should safely handle nested prototype pollution attempts", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      // Try various prototype pollution patterns
      routesApi.remove("__proto__.polluted");
      routesApi.remove("constructor.prototype");

      // Should have warnings for not found (may also include navigation warnings)
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("not found"),
      );

      warnSpy.mockRestore();
    });
  });
});

describe("removing the route you are navigating TO (#1756)", () => {
  /**
   * The in-flight guard protects the COMMITTED state, not "the active route"
   * in general — and that asymmetry is correct, not a gap. Measured both ways:
   *
   * · remove the route you are ON → refused. Allowing it would leave
   *   `getState().name` naming a route that no longer exists.
   * · remove the route you are navigating TO (or an ancestor of it) → applied,
   *   and the navigation is cancelled by the commit door. The committed state
   *   stays on a route that still exists, so nothing is corrupted.
   *
   * ⚠ Refusing the second case was proposed and MEASURED HARMFUL: with the
   * removal refused the guard returns `true`, the navigation completes into the
   * route the application was revoking, and the route stays in the tree. The
   * app's revocation silently does not happen and the user lands exactly where
   * it was trying to keep them out of.
   *
   * What #1756 really exposed is a diagnostic gap, and that is what changed:
   * the warning used to say "may cause unexpected behavior" and left the caller
   * to connect their own `remove()` to a bare `TRANSITION_CANCELLED`.
   */
  const routes = [
    { name: "home", path: "/home" },
    {
      name: "admin",
      path: "/admin",
      children: [{ name: "panel", path: "/panel" }],
    },
  ];

  it("applies the removal and cancels the navigation, leaving the committed state intact", async () => {
    const r = createRouter(routes, { allowNotFound: true });

    await r.start("/home");

    getLifecycleApi(r).addActivateGuard("admin.panel", () => () => {
      getRoutesApi(r).remove("admin");

      return true;
    });

    await expect(r.navigate("admin.panel")).rejects.toMatchObject({
      code: errorCodes.TRANSITION_CANCELLED,
    });

    expect(getRoutesApi(r).has("admin")).toBe(false);
    expect(getRoutesApi(r).has("admin.panel")).toBe(false);
    // The discriminator: the committed state still names a live route. That is
    // the invariant the from-state guard exists for, and it holds here without
    // the removal being refused.
    expect(r.getState()?.name).toBe("home");
    expect(getRoutesApi(r).has("home")).toBe(true);

    r.dispose();
  });

  it("warns with the mechanism, not with 'may cause unexpected behavior'", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const r = createRouter(routes, { allowNotFound: true });

    await r.start("/home");

    getLifecycleApi(r).addActivateGuard("admin.panel", () => () => {
      getRoutesApi(r).remove("admin");

      return true;
    });

    await r.navigate("admin.panel").catch(() => {});

    // Bound to the ONE `[router.removeRoute]` call rather than to a join of
    // every warning: a joined haystack passes even when the sentences come from
    // different messages, which is strictly weaker than the sibling assertions
    // in this same file.
    const warned = warnSpy.mock.calls
      .map((call) => String(call[0]))
      .filter((line) => line.includes("[router.removeRoute]"))
      .join("\n");

    expect(warnSpy.mock.calls.length).toBeGreaterThan(0);
    // The substring the sibling assertions key on stays.
    expect(warned).toContain("navigation is in progress");
    // The negative this test's own title promises — appending the new sentences
    // to the old text would otherwise pass a test named "not with …".
    expect(warned).not.toContain("may cause unexpected behavior");
    // BOTH codes, and that is a correction rather than thoroughness: the first
    // draft promised `TRANSITION_CANCELLED` alone, which is true only while the
    // guard walk is synchronous. The async cell below is what caught it.
    // The code VALUES, which is what a caller reads off `error.code` —
    // `errorCodes.TRANSITION_CANCELLED` is the string "CANCELLED".
    expect(warned).toContain(errorCodes.TRANSITION_CANCELLED);
    expect(warned).toContain(errorCodes.ROUTE_NOT_FOUND);
    expect(warned).not.toContain("TRANSITION_CANCELLED");
    // and the hook that actually fires
    expect(warned).toContain("onTransitionError");
    expect(warned).toContain("committed state is not affected");

    warnSpy.mockRestore();
    r.dispose();
  });

  it("the failure code differs by arc — CANCELLED sync, ROUTE_NOT_FOUND async", async () => {
    // ⚠ The cell that pins the message honest. `handleNavigateError` rewraps
    // the door's `ROUTE_NOT_FOUND` into `TRANSITION_CANCELLED` only when it
    // finds the machine already out of the band, which is the synchronous walk;
    // once the walk has gone async the raw code reaches the caller. A message
    // naming one of the two is wrong on the other, and the tier had no cell
    // that would say so.
    const run = async (asyncGuard: boolean): Promise<string | undefined> => {
      const r = createRouter(routes, { allowNotFound: true });

      await r.start("/home");

      getLifecycleApi(r).addActivateGuard("admin.panel", () =>
        asyncGuard
          ? async () => {
              getRoutesApi(r).remove("admin");

              return true;
            }
          : () => {
              getRoutesApi(r).remove("admin");

              return true;
            },
      );

      const code = await r
        .navigate("admin.panel")
        .then(() => undefined)
        .catch((error: unknown) => (error as RouterError).code);

      r.dispose();

      return code;
    };

    await expect(run(false)).resolves.toBe(errorCodes.TRANSITION_CANCELLED);
    await expect(run(true)).resolves.toBe(errorCodes.ROUTE_NOT_FOUND);
  });

  it("the two codes are a CHANNEL split, not only an arc split — the promise and the hook disagree on the sync arc", async () => {
    // ⚠ The cell the message's own sentence rests on. Reading only the promise
    // (the cell above) says "CANCELLED sync, ROUTE_NOT_FOUND async" and invites
    // the message to append "…and reports it through onTransitionError", which
    // reads as the hook carrying those codes. It does not: the hook carries
    // `ROUTE_NOT_FOUND` on BOTH arcs, so on the synchronous one a single
    // failure has two codes depending on where the caller listens. Nothing else
    // in the tier reads both channels of one navigation, which is why the
    // message shipped saying it wrong twice.
    const run = async (
      asyncGuard: boolean,
    ): Promise<{ promise: string | undefined; hooks: string[] }> => {
      const r = createRouter(routes, { allowNotFound: true });

      await r.start("/home");

      const hooks: string[] = [];

      r.usePlugin(() => ({
        onTransitionError: (
          _toState: unknown,
          _fromState: unknown,
          error: RouterError,
        ) => {
          hooks.push(`error:${error.code}`);
        },
        onTransitionCancel: () => {
          hooks.push("cancel");
        },
      }));

      getLifecycleApi(r).addDeactivateGuard("home", () =>
        asyncGuard
          ? async () => {
              await Promise.resolve();
              getRoutesApi(r).remove("admin");

              return true;
            }
          : () => {
              getRoutesApi(r).remove("admin");

              return true;
            },
      );

      const promise = await r
        .navigate("admin.panel")
        .then(() => undefined)
        .catch((error: unknown) => (error as RouterError).code);

      r.dispose();

      return { promise, hooks };
    };

    // Synchronous walk: the two channels DISAGREE.
    await expect(run(false)).resolves.toStrictEqual({
      promise: errorCodes.TRANSITION_CANCELLED,
      hooks: [`error:${errorCodes.ROUTE_NOT_FOUND}`],
    });

    // Once it has gone async they agree — which is exactly why an arc-only
    // reading of this failure looks complete and is not.
    await expect(run(true)).resolves.toStrictEqual({
      promise: errorCodes.ROUTE_NOT_FOUND,
      hooks: [`error:${errorCodes.ROUTE_NOT_FOUND}`],
    });
  });

  it("the warning splits the codes by channel and names the stable one", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const r = createRouter(routes, { allowNotFound: true });

    await r.start("/home");

    getLifecycleApi(r).addActivateGuard("admin.panel", () => () => {
      getRoutesApi(r).remove("admin");

      return true;
    });

    await r.navigate("admin.panel").catch(() => {});

    const warned = warnSpy.mock.calls
      .map((call) => String(call[0]))
      .filter((line) => line.includes("[router.removeRoute]"))
      .join("\n");

    // The promise-side sentence carries BOTH codes; the hook-side sentence
    // carries only the one the hook actually reports. Asserting the substrings
    // rather than the whole message keeps the wording free to change while the
    // two claims stay pinned to the cell above.
    expect(warned).toContain(
      `rejected navigate() promise carries "${errorCodes.TRANSITION_CANCELLED}"`,
    );
    expect(warned).toContain(
      `"${errorCodes.ROUTE_NOT_FOUND}" once it has gone async`,
    );
    expect(warned).toContain(
      `onTransitionError always reports "${errorCodes.ROUTE_NOT_FOUND}"`,
    );
    expect(warned).toContain("onTransitionCancel never fires");

    warnSpy.mockRestore();
    r.dispose();
  });

  it("does not claim the removal happened — the guard runs above the existence check", async () => {
    // `remove("nope")` mid-navigation reaches this warning too, and is followed
    // by "not found. No changes made." The first draft said "the removal is
    // applied" and contradicted the very next log line.
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const r = createRouter(routes, { allowNotFound: true });

    await r.start("/home");

    getLifecycleApi(r).addActivateGuard("admin.panel", () => () => {
      getRoutesApi(r).remove("nope");

      return true;
    });

    await r.navigate("admin.panel");

    const warned = warnSpy.mock.calls.map((call) => String(call[0])).join("\n");

    expect(warned).toContain("navigation is in progress");
    expect(warned).toContain("not found. No changes made.");
    expect(warned).not.toContain("removal is applied");

    warnSpy.mockRestore();
    r.dispose();
  });

  it("the committed state survives every late window, not just a guard", async () => {
    // ⚠ The claim "the committed state is never affected" was measured across
    // six windows and pinned in ONE — the synchronous activation guard above.
    // Four of the six are only reachable from outside the guard walk, and each
    // is a distinct arc through `handleNavigateError` / `finishAsyncNavigation`.
    // A claim measured six ways and pinned once is a claim that rots.
    const from = async (
      wire: (r: Router, removeIt: () => void) => void,
    ): Promise<{ name: string | undefined; live: boolean }> => {
      const r = createRouter(routes, { allowNotFound: true });

      await r.start("/home");

      wire(r, () => {
        getRoutesApi(r).remove("admin");
      });

      await r.navigate("admin.panel").catch(() => undefined);

      const name = r.getState()?.name;
      const live = name !== undefined && getRoutesApi(r).has(name);

      r.dispose();

      return { name, live };
    };

    const cells = [
      await from((r, rm) => {
        getLifecycleApi(r).addDeactivateGuard("home", () => () => {
          rm();

          return true;
        });
      }),
      await from((r, rm) =>
        r.subscribeLeave(() => {
          rm();
        }),
      ),
      await from((r, rm) =>
        r.usePlugin(() => ({
          onTransitionStart: () => {
            rm();
          },
        })),
      ),
      await from((r, rm) =>
        r.usePlugin(() => ({
          onTransitionLeaveApprove: () => {
            rm();
          },
        })),
      ),
      await from((r, rm) => {
        getLifecycleApi(r).addActivateGuard("admin.panel", () => async () => {
          rm();

          return true;
        });
      }),
    ];

    // Every window leaves the router on a route that still exists.
    expect(cells.map((cell) => cell.live)).toStrictEqual([
      true,
      true,
      true,
      true,
      true,
    ]);
    expect(cells.map((cell) => cell.name)).toStrictEqual([
      "home",
      "home",
      "home",
      "home",
      "home",
    ]);
  });

  it("CONTROL — a sibling whose name merely PREFIXES the active one is removable", async () => {
    // ⚠ Closes a mutant that survived the whole tier: dropping the dot from
    // `currentStateName.startsWith(name + ".")` turns the ancestry test into a
    // string-prefix test, and `admin` is a prefix of `admin-protected`. Nothing
    // else in the repo removes a route whose name merely prefixes the committed
    // one, so the widened guard refused a legal removal in silence.
    const r = createRouter(
      [
        { name: "admin", path: "/admin" },
        { name: "admin-protected", path: "/admin-protected" },
      ],
      { allowNotFound: true },
    );

    await r.start("/admin-protected");

    getRoutesApi(r).remove("admin");

    expect(getRoutesApi(r).has("admin")).toBe(false);
    expect(r.getState()?.name).toBe("admin-protected");

    r.dispose();
  });

  it("CONTROL — removing the route you are ON is still refused", async () => {
    const r = createRouter(routes, { allowNotFound: true });

    await r.start("/home");

    getLifecycleApi(r).addActivateGuard("admin.panel", () => () => {
      getRoutesApi(r).remove("home");

      return true;
    });

    await r.navigate("admin.panel");

    expect(getRoutesApi(r).has("home")).toBe(true);
    expect(r.getState()?.name).toBe("admin.panel");

    r.dispose();
  });
});

describe("remove() clears only what it removed (#1757)", () => {
  /**
   * A flat DOTTED name is a standalone node: `{ name: "x.y" }` declared BESIDE
   * `{ name: "x" }` is not a child of `x` — the matcher's segment chain for it
   * is `["x.y"]`, not `["x", "x.y"]`. Four sites answered "is this in the
   * subtree being removed?" by testing the NAME STRING for the prefix `x.`,
   * which is a strictly WIDER set than the splice:
   *
   *   1. `clearRouteConfigurations` — purged the survivor's config AND its
   *      lifecycle handlers, so a blocking `canActivate` silently disappeared
   *      (a fail-open: `navigate` went from CANNOT_ACTIVATE to RESOLVED);
   *   2. the same predicate on `forwardMap` VALUES — a third route's
   *      `forwardTo` pointing AT the survivor was cleared;
   *   3. `collectSubtree` — the `TREE_CHANGED` payload named the survivor as
   *      removed while `has()` still answered `true`;
   *   4. `validateRemoveRoute`'s ancestry test — refused the removal outright
   *      while the committed state was the unrelated survivor, and reported
   *      "it is currently active", which is false.
   *
   * The rule is one question asked of the TREE rather than of the string.
   */
  const flatRoutes = [
    { name: "home", path: "/home" },
    { name: "x", path: "/x" },
    {
      name: "x.y",
      path: "/xy",
      defaultParams: { k: "v" },
      decodeParams: (p: ParamsSearch) => p,
    },
    { name: "src", path: "/src", forwardTo: "x.y" },
  ];

  it("keeps a flat dotted route's blocking canActivate — the fail-open", async () => {
    const r = createRouter(flatRoutes, { allowNotFound: true });

    await r.start("/home");

    getLifecycleApi(r).addActivateGuard("x.y", () => () => false);

    const before = await r.navigate("x.y").then(
      () => "RESOLVED",
      (error: unknown) => (error as RouterError).code,
    );

    getRoutesApi(r).remove("x");

    const after = await r.navigate("x.y").then(
      () => "RESOLVED",
      (error: unknown) => (error as RouterError).code,
    );

    expect(getRoutesApi(r).has("x.y")).toBe(true);
    // The discriminator: the survivor's guard must answer the same before and
    // after a removal that never touched it.
    expect(after).toBe(before);
    expect(after).toBe(errorCodes.CANNOT_ACTIVATE);

    r.dispose();
  });

  it("keeps a flat dotted route's config, and the forwardTo pointing at it", async () => {
    const r = createRouter(flatRoutes, { allowNotFound: true });

    await r.start("/home");

    getRoutesApi(r).remove("x");

    expect(getRoutesApi(r).get("x.y")?.defaultParams).toStrictEqual({ k: "v" });
    expect(getRoutesApi(r).get("x.y")?.decodeParams).toBeInstanceOf(Function);
    expect(getRoutesApi(r).get("src")?.forwardTo).toBe("x.y");

    r.dispose();
  });

  it("names only the routes it removed in the TREE_CHANGED payload", async () => {
    const r = createRouter(flatRoutes, { allowNotFound: true });

    await r.start("/home");

    const removed: string[][] = [];

    getRoutesApi(r).subscribeChanges((event) => {
      if (event.op === "remove") {
        removed.push(event.removedSubtree.map((route) => route.name));
      }
    });

    getRoutesApi(r).remove("x");

    // A payload naming a route `has()` still answers `true` for is the lying
    // event of #1194 manifestation (1), reached through `remove`.
    expect(removed).toStrictEqual([["x"]]);
    expect(getRoutesApi(r).has("x.y")).toBe(true);

    r.dispose();
  });

  it("does not refuse the removal because the committed state is a flat dotted namesake", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const r = createRouter(flatRoutes, { allowNotFound: true });

    await r.start("/xy");

    expect(r.getState()?.name).toBe("x.y");

    getRoutesApi(r).remove("x");

    expect(getRoutesApi(r).has("x")).toBe(false);
    expect(
      warnSpy.mock.calls
        .map((call) => String(call[0]))
        .filter((line) => line.includes("currently active")),
    ).toStrictEqual([]);

    warnSpy.mockRestore();
    r.dispose();
  });

  it("reports not-found for a name that is not a route, even when the committed name is dot-prefixed by it", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const r = createRouter(
      [
        { name: "home", path: "/home" },
        { name: "x.y", path: "/xy" },
      ],
      { allowNotFound: true },
    );

    await r.start("/xy");

    getRoutesApi(r).remove("x");

    const warned = warnSpy.mock.calls
      .map((call) => String(call[0]))
      .filter((line) => line.includes("[router.removeRoute]"))
      .join("\n");

    // The ancestry refusal ran ABOVE the existence check, so a name that is not
    // a route at all was reported as "currently active".
    expect(warned).toContain('Route "x" not found');
    expect(warned).not.toContain("currently active");

    warnSpy.mockRestore();
    r.dispose();
  });

  it("leaves an external guard registered for a NON-route dot-prefixed name alone", async () => {
    // The one observable change beyond the defect, pinned because the changeset
    // claims it. An external guard may be registered before its route exists;
    // an unrelated `remove()` used to sweep it by name prefix, so the route
    // added afterwards came up unguarded. Now the guard survives and binds, the
    // same as it would have with no removal at all.
    const r = createRouter(
      [
        { name: "home", path: "/home" },
        { name: "x", path: "/x" },
      ],
      { allowNotFound: true },
    );

    await r.start("/home");

    getLifecycleApi(r).addActivateGuard("x.ghost", () => () => false);

    getRoutesApi(r).remove("x");
    getRoutesApi(r).add({ name: "x.ghost", path: "/ghost" });

    await expect(r.navigate("x.ghost")).rejects.toMatchObject({
      code: errorCodes.CANNOT_ACTIVATE,
    });

    r.dispose();
  });

  it("CONTROL — a REAL child still goes with its parent, config, guards and payload", async () => {
    const r = createRouter(
      [
        { name: "home", path: "/home" },
        {
          name: "x",
          path: "/x",
          children: [{ name: "y", path: "/y", defaultParams: { k: "v" } }],
        },
        { name: "src", path: "/src", forwardTo: "x.y" },
      ],
      { allowNotFound: true },
    );

    await r.start("/home");

    getLifecycleApi(r).addActivateGuard("x.y", () => () => false);

    const removed: string[][] = [];

    getRoutesApi(r).subscribeChanges((event) => {
      if (event.op === "remove") {
        removed.push(event.removedSubtree.map((route) => route.name));
      }
    });

    getRoutesApi(r).remove("x");

    expect(getRoutesApi(r).has("x")).toBe(false);
    expect(getRoutesApi(r).has("x.y")).toBe(false);
    expect(removed).toStrictEqual([["x", "x.y"]]);
    expect(getRoutesApi(r).get("src")?.forwardTo).toBeUndefined();

    r.dispose();
  });

  it("CONTROL — the removal is still refused while you are ON the route or a real ancestor of it", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const r = createRouter(
      [
        { name: "home", path: "/home" },
        { name: "x", path: "/x", children: [{ name: "y", path: "/y" }] },
      ],
      { allowNotFound: true },
    );

    await r.start("/x/y");

    getRoutesApi(r).remove("x");

    expect(getRoutesApi(r).has("x")).toBe(true);
    expect(
      warnSpy.mock.calls
        .map((call) => String(call[0]))
        .filter((line) => line.includes("currently active")),
    ).toHaveLength(1);

    warnSpy.mockRestore();
    r.dispose();
  });
});
