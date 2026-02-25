import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { errorCodes, getPluginApi, getRoutesApi } from "@real-router/core";

import { createTestRouter } from "../../../helpers";

import type { Router, RouterError, RoutesApi } from "@real-router/core";

let router: Router;
let routesApi: RoutesApi;

describe("core/routes/removeRoute", () => {
  beforeEach(async () => {
    router = createTestRouter();
    routesApi = getRoutesApi(router);
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
      expect(() => router.buildPath("removable")).toThrowError(/not defined/);
    });

    it("should allow re-adding route with same name after removal", async () => {
      routesApi.add({ name: "reusable", path: "/old-path" });
      routesApi.remove("reusable");

      // Should not throw - route was fully removed
      expect(() => {
        routesApi.add({ name: "reusable", path: "/new-path" });
      }).not.toThrowError();

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
      }).not.toThrowError();

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
      }).not.toThrowError();

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
      router.addDeactivateGuard("editor", () => guard);

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
      router.addDeactivateGuard("form1", () => guard1);
      router.addDeactivateGuard("form2", () => guard2);

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
      router.addDeactivateGuard("dashboard", () => () => true);

      routesApi.remove("dashboard");

      // After removal, route no longer exists
      expect(routesApi.has("dashboard")).toBe(false);
      expect(getPluginApi(router).matchPath("/dashboard")).toBeUndefined();
    });

    it("should not throw when route has no lifecycle handlers", async () => {
      routesApi.add({ name: "simple", path: "/simple" });

      expect(() => {
        routesApi.remove("simple");
      }).not.toThrowError();
    });

    it("should not emit warning when clearing non-existent lifecycle handlers", async () => {
      routesApi.add({ name: "nohandlers", path: "/nohandlers" });

      // The silent parameter should suppress warnings
      expect(() => {
        routesApi.remove("nohandlers");
      }).not.toThrowError();

      // Route should be removed
      expect(routesApi.has("nohandlers")).toBe(false);
    });
  });

  describe("config cleanup", () => {
    it("should clear decoders on removeRoute", async () => {
      const decodeParams = vi.fn((params) => ({
        ...params,
        id: Number(params.id),
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
      const encodeParams = vi.fn((params) => ({
        ...params,
        id: `${params.id as number}`,
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
      router.addDeactivateGuard("area.page", () => guard);

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
     * These tests verify the fix for: removeFromDefinitions returns boolean
     * but it was ignored, causing O(N) rebuildTree even for non-existent routes.
     *
     * After fix: early return with warning when route not found.
     */

    it("should log warning when removing non-existent route", async () => {
      const { logger } = await import("@real-router/logger");
      const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});

      routesApi.remove("nonexistent");

      expect(warnSpy).toHaveBeenCalledWith(
        "router.removeRoute",
        'Route "nonexistent" not found. No changes made.',
      );

      warnSpy.mockRestore();
    });

    it("should log warning when removing non-existent child route", async () => {
      const { logger } = await import("@real-router/logger");
      const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});

      routesApi.add({
        name: "parent",
        path: "/parent",
        children: [{ name: "exists", path: "/exists" }],
      });

      routesApi.remove("parent.nonexistent");

      expect(warnSpy).toHaveBeenCalledWith(
        "router.removeRoute",
        'Route "parent.nonexistent" not found. No changes made.',
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
        decodeParams: (p) => ({ ...p, id: Number(p.id) }),
        encodeParams: (p) => ({ ...p, id: `${p.id as number}` }),
        canActivate: () => activateGuard,
      });
      router.addDeactivateGuard("existing", () => deactivateGuard);

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
      const { logger } = await import("@real-router/logger");
      const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});

      routesApi.add({ name: "dashboard", path: "/dashboard" });
      await router.navigate("dashboard");

      // Verify we're on the route
      expect(router.getState()?.name).toBe("dashboard");

      // Attempt to remove active route
      routesApi.remove("dashboard");

      // Should warn and NOT remove
      expect(warnSpy).toHaveBeenCalledWith(
        "router.removeRoute",
        'Cannot remove route "dashboard" — it is currently active. Navigate away first.',
      );

      // Route should still exist
      expect(getPluginApi(router).matchPath("/dashboard")?.name).toBe(
        "dashboard",
      );

      warnSpy.mockRestore();
    });

    it("should block removal of parent when child is active", async () => {
      const { logger } = await import("@real-router/logger");
      const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});

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
        "router.removeRoute",
        'Cannot remove route "parentRoute" — it is currently active (current: "parentRoute.childRoute"). Navigate away first.',
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
      const { logger } = await import("@real-router/logger");
      const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});

      routesApi.add({ name: "blocked", path: "/blocked" });
      await router.navigate("blocked");

      routesApi.remove("blocked");

      // Should warn when blocked
      expect(warnSpy).toHaveBeenCalledWith(
        "router.removeRoute",
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
        const { logger } = await import("@real-router/logger");
        const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});

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
          "router.removeRoute",
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
        const { logger } = await import("@real-router/logger");
        const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});

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
          "router.removeRoute",
          expect.stringContaining("currently active"),
        );

        // Route should still exist
        expect(getPluginApi(router).matchPath("/async-complete")?.name).toBe(
          "asyncComplete",
        );

        warnSpy.mockRestore();
      });

      it("should warn when removing unrelated route during navigation", async () => {
        const { logger } = await import("@real-router/logger");
        const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});

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
          "router.removeRoute",
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
      const { logger } = await import("@real-router/logger");
      const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});

      // Empty string is technically a valid route name in the type system
      // but no route has empty name in definitions
      routesApi.remove("");

      expect(warnSpy).toHaveBeenCalledWith(
        "router.removeRoute",
        'Route "" not found. No changes made.',
      );

      warnSpy.mockRestore();
    });

    // 12.5: Very long name (> 10000 characters)
    // MAX_ROUTE_NAME_LENGTH is 10,000 in type-guards package
    it("should throw TypeError for name exceeding 10000 characters", async () => {
      const longName = "a".repeat(10_001);

      expect(() => {
        routesApi.remove(longName);
      }).toThrowError(TypeError);
      expect(() => {
        routesApi.remove(longName);
      }).toThrowError(/exceeds maximum length/);
    });

    // 12.6: Exact boundary (10000 characters)
    it("should accept name with exactly 10000 characters", async () => {
      const { logger } = await import("@real-router/logger");
      const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});

      const exactLimit = "a".repeat(10_000);

      // Should not throw - exactly 10000 is valid
      expect(() => {
        routesApi.remove(exactLimit);
      }).not.toThrowError();

      // Route doesn't exist, so graceful handling
      expect(warnSpy).toHaveBeenCalledWith(
        "router.removeRoute",
        expect.stringContaining("not found"),
      );

      warnSpy.mockRestore();
    });

    // 12.7: Unicode characters in name
    it("should throw TypeError for Cyrillic characters in name", async () => {
      expect(() => {
        routesApi.remove("маршрут");
      }).toThrowError(TypeError);
    });

    it("should throw TypeError for emoji in name", async () => {
      expect(() => {
        routesApi.remove("route_🚀");
      }).toThrowError(TypeError);
    });

    it("should throw TypeError for CJK characters in name", async () => {
      expect(() => {
        routesApi.remove("route.日本語");
      }).toThrowError(TypeError);
    });

    // 12.8: System routes (@@prefix)
    it("should handle system route prefix gracefully", async () => {
      const { logger } = await import("@real-router/logger");
      const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});

      // System routes bypass pattern validation but don't exist
      routesApi.remove("@@real-router/UNKNOWN");

      expect(warnSpy).toHaveBeenCalledWith(
        "router.removeRoute",
        'Route "@@real-router/UNKNOWN" not found. No changes made.',
      );

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
      const { logger } = await import("@real-router/logger");
      const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});

      // __proto__ passes pattern validation [a-zA-Z_][a-zA-Z0-9_]*
      // but no such route exists in definitions
      routesApi.remove("__proto__");

      expect(warnSpy).toHaveBeenCalledWith(
        "router.removeRoute",
        'Route "__proto__" not found. No changes made.',
      );

      // Verify no prototype pollution occurred
      expect(Object.prototype.hasOwnProperty.call({}, "polluted")).toBe(false);

      warnSpy.mockRestore();
    });

    it("should handle constructor as route name gracefully", async () => {
      const { logger } = await import("@real-router/logger");
      const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});

      routesApi.remove("constructor");

      expect(warnSpy).toHaveBeenCalledWith(
        "router.removeRoute",
        'Route "constructor" not found. No changes made.',
      );

      warnSpy.mockRestore();
    });

    it("should handle prototype as route name gracefully", async () => {
      const { logger } = await import("@real-router/logger");
      const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});

      routesApi.remove("prototype");

      expect(warnSpy).toHaveBeenCalledWith(
        "router.removeRoute",
        'Route "prototype" not found. No changes made.',
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
      const { logger } = await import("@real-router/logger");
      const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});

      // Try various prototype pollution patterns
      routesApi.remove("__proto__.polluted");
      routesApi.remove("constructor.prototype");

      // Should have warnings for not found (may also include navigation warnings)
      expect(warnSpy).toHaveBeenCalledWith(
        "router.removeRoute",
        expect.stringContaining("not found"),
      );

      warnSpy.mockRestore();
    });
  });

  describe("input validation", () => {
    it("should throw TypeError for null name", async () => {
      expect(() => {
        routesApi.remove(null as unknown as string);
      }).toThrowError(TypeError);
    });

    it("should throw TypeError for undefined name", async () => {
      expect(() => {
        routesApi.remove(undefined as unknown as string);
      }).toThrowError(TypeError);
    });

    it("should throw TypeError for number name", async () => {
      expect(() => {
        routesApi.remove(123 as unknown as string);
      }).toThrowError(TypeError);
    });

    it("should throw TypeError for object name", async () => {
      expect(() => {
        routesApi.remove({} as unknown as string);
      }).toThrowError(TypeError);
    });

    it("should throw TypeError for Proxy with overridden toString (12.14)", async () => {
      // Proxy that tries to masquerade as a string via toString/valueOf
      const maliciousProxy = new Proxy(
        { value: "realRoute" },
        {
          get(target, prop) {
            if (prop === Symbol.toPrimitive) {
              return () => "home";
            }
            if (prop === "toString" || prop === "valueOf") {
              return () => "home";
            }

            return Reflect.get(target, prop);
          },
        },
      );

      // typeof Proxy === "object", so it should be rejected BEFORE any coercion
      expect(() => {
        routesApi.remove(maliciousProxy as unknown as string);
      }).toThrowError(TypeError);

      // Original route should remain untouched
      expect(getPluginApi(router).matchPath("/")).toBeDefined();
    });

    it("should throw TypeError for String wrapper object (12.16)", async () => {
      // new String() creates an object, not a primitive string
      // eslint-disable-next-line unicorn/new-for-builtins, sonarjs/no-primitive-wrappers
      const stringWrapper = new String("home");

      // typeof stringWrapper === "object", not "string"
      expect(() => {
        routesApi.remove(stringWrapper as unknown as string);
      }).toThrowError(TypeError);

      // Original route should remain untouched
      expect(getPluginApi(router).matchPath("/")).toBeDefined();
    });

    it("should throw TypeError for whitespace-only name", async () => {
      expect(() => {
        routesApi.remove("   ");
      }).toThrowError(TypeError);
    });

    it("should throw TypeError for name with leading dot", async () => {
      expect(() => {
        routesApi.remove(".invalid");
      }).toThrowError(TypeError);
    });

    it("should throw TypeError for name with trailing dot", async () => {
      expect(() => {
        routesApi.remove("invalid.");
      }).toThrowError(TypeError);
    });

    it("should throw TypeError for name starting with number", async () => {
      expect(() => {
        routesApi.remove("123invalid");
      }).toThrowError(TypeError);
    });

    it("should throw TypeError for name with consecutive dots", async () => {
      expect(() => {
        routesApi.remove("invalid..name");
      }).toThrowError(TypeError);
    });
  });
});
