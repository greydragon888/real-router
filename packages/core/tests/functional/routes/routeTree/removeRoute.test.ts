import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { errorCodes } from "@real-router/core";

import { createTestRouter } from "../../../helpers";

import type { Router } from "@real-router/core";

let router: Router;

describe("core/routes/removeRoute", () => {
  beforeEach(() => {
    router = createTestRouter();
    router.start("");
  });

  afterEach(() => {
    router.stop();
  });

  describe("full route removal", () => {
    it("should remove route from tree (matchPath returns undefined)", () => {
      router.addRoute({ name: "temporary", path: "/temporary" });

      // Route exists before removal
      expect(router.matchPath("/temporary")?.name).toBe("temporary");

      router.removeRoute("temporary");

      // Route should not match after removal
      expect(router.matchPath("/temporary")).toBeUndefined();
    });

    it("should remove route so buildPath throws", () => {
      router.addRoute({ name: "removable", path: "/removable" });

      // Route exists before removal
      expect(router.buildPath("removable")).toBe("/removable");

      router.removeRoute("removable");

      // buildPath should throw for non-existent route
      expect(() => router.buildPath("removable")).toThrowError(/not defined/);
    });

    it("should allow re-adding route with same name after removal", () => {
      router.addRoute({ name: "reusable", path: "/old-path" });
      router.removeRoute("reusable");

      // Should not throw - route was fully removed
      expect(() => {
        router.addRoute({ name: "reusable", path: "/new-path" });
      }).not.toThrowError();

      expect(router.matchPath("/new-path")?.name).toBe("reusable");
      expect(router.matchPath("/old-path")).toBeUndefined();
    });

    it("should remove route with children", () => {
      router.addRoute({
        name: "parent",
        path: "/parent",
        children: [
          { name: "child1", path: "/child1" },
          { name: "child2", path: "/child2" },
        ],
      });

      expect(router.matchPath("/parent/child1")?.name).toBe("parent.child1");

      router.removeRoute("parent");

      expect(router.matchPath("/parent")).toBeUndefined();
      expect(router.matchPath("/parent/child1")).toBeUndefined();
      expect(router.matchPath("/parent/child2")).toBeUndefined();
    });

    it("should remove only specified child route", () => {
      router.addRoute({
        name: "category",
        path: "/category",
        children: [
          { name: "keep", path: "/keep" },
          { name: "remove", path: "/remove" },
        ],
      });

      router.removeRoute("category.remove");

      // Parent and sibling should still exist
      expect(router.matchPath("/category")?.name).toBe("category");
      expect(router.matchPath("/category/keep")?.name).toBe("category.keep");

      // Removed child should not exist
      expect(router.matchPath("/category/remove")).toBeUndefined();
    });

    it("should handle removal of non-existent route gracefully", () => {
      // Route doesn't exist - removeRoute should not throw
      expect(() => router.removeRoute("nonexistent")).not.toThrowError();

      // Router should still function normally
      expect(router.matchPath("/")).toBeDefined();
    });

    it("should handle multiple removals of the same route gracefully (12.13)", () => {
      // Add a route
      router.addRoute({ name: "temporary", path: "/temporary" });

      expect(router.matchPath("/temporary")?.name).toBe("temporary");

      // First removal - should succeed
      const result1 = router.removeRoute("temporary");

      expect(result1).toBe(router);
      expect(router.matchPath("/temporary")).toBeUndefined();

      // Second removal - should be graceful (warning, no throw)
      const result2 = router.removeRoute("temporary");

      expect(result2).toBe(router);

      // Third removal - still graceful
      const result3 = router.removeRoute("temporary");

      expect(result3).toBe(router);

      // Router should still function normally
      expect(router.matchPath("/")).toBeDefined();
    });

    it("should handle removal of non-existent child route gracefully", () => {
      router.addRoute({
        name: "wrapper",
        path: "/wrapper",
        children: [{ name: "exists", path: "/exists" }],
      });

      // Child doesn't exist - should not throw
      expect(() =>
        router.removeRoute("wrapper.nonexistent"),
      ).not.toThrowError();

      // Parent and existing child should remain
      expect(router.matchPath("/wrapper")?.name).toBe("wrapper");
      expect(router.matchPath("/wrapper/exists")?.name).toBe("wrapper.exists");
    });
  });

  describe("lifecycle cleanup", () => {
    it("should clear canActivate handler on removeRoute", () => {
      const guard = vi.fn().mockReturnValue(false);

      router.addRoute({
        name: "protected",
        path: "/protected",
        canActivate: () => guard,
      });

      // Verify guard works before removal - navigation should be blocked
      router.navigate("protected", (err) => {
        expect(err?.code).toBe(errorCodes.CANNOT_ACTIVATE);
        expect(guard).toHaveBeenCalled();
      });

      router.removeRoute("protected");

      // After removal, route no longer exists
      expect(router.hasRoute("protected")).toBe(false);
      expect(router.matchPath("/protected")).toBeUndefined();
    });

    it("should clear canDeactivate handler on removeRoute", () => {
      const guard = vi.fn().mockReturnValue(false);

      router.addRoute({ name: "editor", path: "/editor" });
      router.addDeactivateGuard("editor", () => guard);

      // Navigate to editor first
      router.navigate("editor", (err) => {
        expect(err).toBeUndefined();

        // Verify guard works - leaving should be blocked
        router.navigate("home", (err) => {
          expect(err?.code).toBe(errorCodes.CANNOT_DEACTIVATE);
          expect(guard).toHaveBeenCalled();
        });
      });

      // Navigate back to home for clean state
      guard.mockReturnValue(true);
      router.navigate("home", () => {});
      guard.mockClear();

      router.removeRoute("editor");

      // After removal, route no longer exists
      expect(router.hasRoute("editor")).toBe(false);
    });

    it("should only clear canDeactivate for removed route", () => {
      const guard1 = vi.fn().mockReturnValue(false);
      const guard2 = vi.fn().mockReturnValue(false);

      router.addRoute({ name: "form1", path: "/form1" });
      router.addRoute({ name: "form2", path: "/form2" });
      router.addDeactivateGuard("form1", () => guard1);
      router.addDeactivateGuard("form2", () => guard2);

      router.removeRoute("form1");

      // form1 no longer exists
      expect(router.hasRoute("form1")).toBe(false);

      // form2 guard should still work - verify by navigation
      router.navigate("form2", () => {
        router.navigate("home", (err) => {
          expect(err?.code).toBe(errorCodes.CANNOT_DEACTIVATE);
          expect(guard2).toHaveBeenCalled();
        });
      });
    });

    it("should clear both canActivate and canDeactivate handlers", () => {
      router.addRoute({
        name: "dashboard",
        path: "/dashboard",
        canActivate: () => () => true,
      });
      router.addDeactivateGuard("dashboard", () => () => true);

      router.removeRoute("dashboard");

      // After removal, route no longer exists
      expect(router.hasRoute("dashboard")).toBe(false);
      expect(router.matchPath("/dashboard")).toBeUndefined();
    });

    it("should not throw when route has no lifecycle handlers", () => {
      router.addRoute({ name: "simple", path: "/simple" });

      expect(() => router.removeRoute("simple")).not.toThrowError();
    });

    it("should not emit warning when clearing non-existent lifecycle handlers", () => {
      router.addRoute({ name: "nohandlers", path: "/nohandlers" });

      // The silent parameter should suppress warnings
      expect(() => router.removeRoute("nohandlers")).not.toThrowError();

      // Route should be removed
      expect(router.hasRoute("nohandlers")).toBe(false);
    });
  });

  describe("config cleanup", () => {
    it("should clear decoders on removeRoute", () => {
      const decodeParams = vi.fn((params) => ({
        ...params,
        id: Number(params.id),
      }));

      router.addRoute({
        name: "withDecoder",
        path: "/with-decoder/:id",
        decodeParams,
      });

      // Verify decoder works before removal
      expect(router.matchPath("/with-decoder/123")?.params.id).toBe(123);

      router.removeRoute("withDecoder");

      // Route no longer exists
      expect(router.hasRoute("withDecoder")).toBe(false);
      expect(router.matchPath("/with-decoder/123")).toBeUndefined();
    });

    it("should clear encoders on removeRoute", () => {
      const encodeParams = vi.fn((params) => ({
        ...params,
        id: `${params.id as number}`,
      }));

      router.addRoute({
        name: "decoded",
        path: "/decoded/:id",
        encodeParams,
      });

      // Verify encoder works before removal
      router.buildPath("decoded", { id: 123 });

      expect(encodeParams).toHaveBeenCalled();

      router.removeRoute("decoded");

      // Route no longer exists
      expect(router.hasRoute("decoded")).toBe(false);
    });

    it("should clear defaultParams on removeRoute", () => {
      router.addRoute({
        name: "withdefaults",
        path: "/withdefaults",
        defaultParams: { page: 1 },
      });

      // Verify defaults work before removal
      expect(router.makeState("withdefaults").params).toStrictEqual({
        page: 1,
      });

      router.removeRoute("withdefaults");

      // Route no longer exists
      expect(router.hasRoute("withdefaults")).toBe(false);
    });

    it("should clear forwardMap on removeRoute", () => {
      router.addRoute({ name: "target", path: "/target" });
      router.addRoute({
        name: "redirect",
        path: "/redirect",
        forwardTo: "target",
      });

      // Verify forward works before removal
      expect(router.forwardState("redirect", {}).name).toBe("target");

      router.removeRoute("redirect");

      // Route no longer exists
      expect(router.hasRoute("redirect")).toBe(false);
    });

    it("should only clear forwardMap for removed route", () => {
      router.addRoute({ name: "dest", path: "/dest" });
      router.addRoute({ name: "fwd1", path: "/fwd1", forwardTo: "dest" });
      router.addRoute({ name: "fwd2", path: "/fwd2", forwardTo: "dest" });

      // Both forward rules work
      expect(router.forwardState("fwd1", {}).name).toBe("dest");
      expect(router.forwardState("fwd2", {}).name).toBe("dest");

      router.removeRoute("fwd1");

      // fwd1 is removed, fwd2 still works
      expect(router.hasRoute("fwd1")).toBe(false);
      expect(router.forwardState("fwd2", {}).name).toBe("dest");
    });

    it("should clear child route forwardMap when parent removed", () => {
      router.addRoute({ name: "dest", path: "/dest" });
      router.addRoute({
        name: "container",
        path: "/container",
        children: [{ name: "fwd", path: "/fwd", forwardTo: "dest" }],
      });

      // Verify child forward works
      expect(router.forwardState("container.fwd", {}).name).toBe("dest");

      router.removeRoute("container");

      // Parent and child routes no longer exist
      expect(router.hasRoute("container")).toBe(false);
      expect(router.hasRoute("container.fwd")).toBe(false);
    });

    it("should clear child route handlers when parent removed", () => {
      const guard = vi.fn().mockReturnValue(false);

      router.addRoute({
        name: "area",
        path: "/area",
        children: [{ name: "page", path: "/page" }],
      });
      router.addDeactivateGuard("area.page", () => guard);

      // Verify guard works before removal
      router.navigate("area.page", () => {
        router.navigate("home", (err) => {
          expect(err?.code).toBe(errorCodes.CANNOT_DEACTIVATE);
          expect(guard).toHaveBeenCalled();
        });
      });

      // Navigate back to home
      guard.mockReturnValue(true);
      router.navigate("home", () => {});

      router.removeRoute("area");

      // Parent and child no longer exist
      expect(router.hasRoute("area")).toBe(false);
      expect(router.hasRoute("area.page")).toBe(false);
    });

    it("should remove route with dynamic forwardTo", () => {
      router.addRoute({ name: "fn-target", path: "/fn-target" });
      router.addRoute({
        name: "fn-forward",
        path: "/fn-forward",
        forwardTo: () => "fn-target",
      });

      expect(router.forwardState("fn-forward", {}).name).toBe("fn-target");

      const fnForwardRoute = router.getRoute("fn-forward");

      expect(typeof fnForwardRoute?.forwardTo).toBe("function");

      router.removeRoute("fn-forward");

      expect(router.hasRoute("fn-forward")).toBe(false);
    });

    it("should not leak forwardFnMap entry after removeRoute and re-add", () => {
      router.addRoute({ name: "re-target", path: "/re-target" });
      router.addRoute({
        name: "re-forward",
        path: "/re-forward",
        forwardTo: () => "re-target",
      });

      expect(router.forwardState("re-forward", {}).name).toBe("re-target");

      router.removeRoute("re-forward");

      // Re-add without forwardTo — should NOT have old dynamic forward
      router.addRoute({ name: "re-forward", path: "/re-forward" });

      expect(router.forwardState("re-forward", {}).name).toBe("re-forward");
    });

    it("should clear child forwardFnMap when parent removed", () => {
      router.addRoute({ name: "fn-dest", path: "/fn-dest" });
      router.addRoute({
        name: "fn-parent",
        path: "/fn-parent",
        children: [
          { name: "child", path: "/child", forwardTo: () => "fn-dest" },
        ],
      });

      // Verify child forward works
      expect(router.forwardState("fn-parent.child", {}).name).toBe("fn-dest");

      // Remove parent — child forwardFnMap should be cleared
      router.removeRoute("fn-parent");

      // Re-add without forwardTo
      router.addRoute({
        name: "fn-parent",
        path: "/fn-parent",
        children: [{ name: "child", path: "/child" }],
      });

      expect(router.forwardState("fn-parent.child", {}).name).toBe(
        "fn-parent.child",
      );
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
      const { logger } = await import("logger");
      const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});

      router.removeRoute("nonexistent");

      expect(warnSpy).toHaveBeenCalledWith(
        "router.removeRoute",
        'Route "nonexistent" not found. No changes made.',
      );

      warnSpy.mockRestore();
    });

    it("should log warning when removing non-existent child route", async () => {
      const { logger } = await import("logger");
      const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});

      router.addRoute({
        name: "parent",
        path: "/parent",
        children: [{ name: "exists", path: "/exists" }],
      });

      router.removeRoute("parent.nonexistent");

      expect(warnSpy).toHaveBeenCalledWith(
        "router.removeRoute",
        'Route "parent.nonexistent" not found. No changes made.',
      );

      warnSpy.mockRestore();
    });

    it("should NOT modify existing routes when removing non-existent route", () => {
      const activateGuard = vi.fn().mockReturnValue(false);
      const deactivateGuard = vi.fn().mockReturnValue(false);

      // Setup: add routes with various configurations
      router.addRoute({
        name: "existing",
        path: "/existing/:id",
        defaultParams: { id: "1" },
        decodeParams: (p) => ({ ...p, id: Number(p.id) }),
        encodeParams: (p) => ({ ...p, id: `${p.id as number}` }),
        canActivate: () => activateGuard,
      });
      router.addDeactivateGuard("existing", () => deactivateGuard);

      // Attempt to remove non-existent route
      router.removeRoute("nonexistent");

      // Verify route still works (behavioral test)
      expect(router.matchPath("/existing/42")?.name).toBe("existing");
      expect(router.buildPath("existing", { id: 99 })).toBe("/existing/99");
      expect(router.makeState("existing").params).toStrictEqual({
        id: "1",
      });

      // Verify canActivate guard still works
      router.navigate("existing", (err) => {
        expect(err?.code).toBe(errorCodes.CANNOT_ACTIVATE);
        expect(activateGuard).toHaveBeenCalled();
      });

      activateGuard.mockClear();
      activateGuard.mockReturnValue(true);

      // Verify canDeactivate guard still works
      router.navigate("existing", () => {
        router.navigate("home", (err) => {
          expect(err?.code).toBe(errorCodes.CANNOT_DEACTIVATE);
          expect(deactivateGuard).toHaveBeenCalled();
        });
      });
    });

    it("should return router for chaining even when route not found", () => {
      const result = router.removeRoute("nonexistent");

      expect(result).toBe(router);
    });
  });

  describe("active route protection", () => {
    /**
     * Tests for blocking removal of currently active route.
     * Prevents inconsistent state where router.getState() points to non-existent route.
     */

    it("should block removal of currently active route with warning", async () => {
      const { logger } = await import("logger");
      const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});

      router.addRoute({ name: "dashboard", path: "/dashboard" });
      router.navigate("dashboard");

      // Verify we're on the route
      expect(router.getState()?.name).toBe("dashboard");

      // Attempt to remove active route
      router.removeRoute("dashboard");

      // Should warn and NOT remove
      expect(warnSpy).toHaveBeenCalledWith(
        "router.removeRoute",
        'Cannot remove route "dashboard" — it is currently active. Navigate away first.',
      );

      // Route should still exist
      expect(router.matchPath("/dashboard")?.name).toBe("dashboard");

      warnSpy.mockRestore();
    });

    it("should block removal of parent when child is active", async () => {
      const { logger } = await import("logger");
      const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});

      router.addRoute({
        name: "parentRoute",
        path: "/parent-route",
        children: [{ name: "childRoute", path: "/child" }],
      });
      router.navigate("parentRoute.childRoute");

      // Verify we're on the child route
      expect(router.getState()?.name).toBe("parentRoute.childRoute");

      // Attempt to remove parent
      router.removeRoute("parentRoute");

      // Should warn with current route info
      expect(warnSpy).toHaveBeenCalledWith(
        "router.removeRoute",
        'Cannot remove route "parentRoute" — it is currently active (current: "parentRoute.childRoute"). Navigate away first.',
      );

      // Parent and child should still exist
      expect(router.matchPath("/parent-route")?.name).toBe("parentRoute");
      expect(router.matchPath("/parent-route/child")?.name).toBe(
        "parentRoute.childRoute",
      );

      warnSpy.mockRestore();
    });

    it("should allow removal of inactive route when another route is active", () => {
      router.addRoute({ name: "active", path: "/active" });
      router.addRoute({ name: "inactive", path: "/inactive" });
      router.navigate("active");

      // Should work - removing inactive route
      router.removeRoute("inactive");

      // Active route still exists, inactive removed
      expect(router.matchPath("/active")?.name).toBe("active");
      expect(router.matchPath("/inactive")).toBeUndefined();
    });

    it("should allow removal of sibling route when on different branch", () => {
      router.addRoute({
        name: "sectionTest",
        path: "/section-test",
        children: [
          { name: "pageA", path: "/a" },
          { name: "pageB", path: "/b" },
        ],
      });
      router.navigate("sectionTest.pageA");

      // Should work - removing sibling
      router.removeRoute("sectionTest.pageB");

      // pageA still exists, pageB removed
      expect(router.matchPath("/section-test/a")?.name).toBe(
        "sectionTest.pageA",
      );
      expect(router.matchPath("/section-test/b")).toBeUndefined();
    });

    it("should allow removal when router has no active state", () => {
      // Stop router to clear state
      router.stop();

      router.addRoute({ name: "test", path: "/test" });

      // Should work - no active state
      router.removeRoute("test");

      expect(router.matchPath("/test")).toBeUndefined();
    });

    it("should allow removal when router not started", () => {
      // Create fresh router without starting
      const freshRouter = createTestRouter();

      freshRouter.addRoute({ name: "temp", path: "/temp" });

      // Should work - router not started
      freshRouter.removeRoute("temp");

      expect(freshRouter.matchPath("/temp")).toBeUndefined();
    });

    it("should return router for chaining when removal blocked", async () => {
      const { logger } = await import("logger");
      const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});

      router.addRoute({ name: "blocked", path: "/blocked" });
      router.navigate("blocked");

      const result = router.removeRoute("blocked");

      // Should still return router for chaining
      expect(result).toBe(router);

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
      it("should clear forwardMap entry when target route is removed", () => {
        router.addRoute({ name: "newDashboard", path: "/new-dashboard" });
        router.addRoute({
          name: "oldDashboard",
          path: "/old-dashboard",
          forwardTo: "newDashboard",
        });

        // Verify forward works
        expect(router.forwardState("oldDashboard", {}).name).toBe(
          "newDashboard",
        );

        // Remove the target route
        router.removeRoute("newDashboard");

        // Forward should no longer redirect (target removed)
        expect(router.forwardState("oldDashboard", {}).name).toBe(
          "oldDashboard",
        );
      });

      it("should keep source route functional after target removal", () => {
        router.addRoute({ name: "targetRoute", path: "/target" });
        router.addRoute({
          name: "sourceRoute",
          path: "/source",
          forwardTo: "targetRoute",
        });

        router.removeRoute("targetRoute");

        // Source route should still exist and be matchable
        expect(router.matchPath("/source")?.name).toBe("sourceRoute");
      });

      it("should allow navigation to source route after target removal", async () => {
        router.addRoute({ name: "forwardTarget", path: "/forward-target" });
        router.addRoute({
          name: "forwardSource",
          path: "/forward-source",
          forwardTo: "forwardTarget",
        });

        router.removeRoute("forwardTarget");

        // Navigation to source should work (no forward happens)
        const result = await new Promise<boolean>((resolve) => {
          router.navigate("forwardSource", {}, {}, (err) => {
            resolve(!err);
          });
        });

        expect(result).toBe(true);
        expect(router.getState()?.name).toBe("forwardSource");
      });

      it("should handle chain of forwardTo when middle target is removed", () => {
        router.addRoute({ name: "final", path: "/final" });
        router.addRoute({
          name: "middle",
          path: "/middle",
          forwardTo: "final",
        });
        router.addRoute({
          name: "start",
          path: "/start",
          forwardTo: "middle",
        });

        // Verify chain works: start -> middle -> final
        expect(router.forwardState("start", {}).name).toBe("final");
        expect(router.forwardState("middle", {}).name).toBe("final");

        // Remove middle route
        router.removeRoute("middle");

        // start's forward to middle should be cleared (middle no longer exists)
        expect(router.forwardState("start", {}).name).toBe("start");
        // middle route no longer exists
        expect(router.hasRoute("middle")).toBe(false);
        // final route should still exist
        expect(router.matchPath("/final")?.name).toBe("final");
      });

      it("should clear forwardMap when source route is removed", () => {
        router.addRoute({ name: "keepTarget", path: "/keep-target" });
        router.addRoute({
          name: "removeSource",
          path: "/remove-source",
          forwardTo: "keepTarget",
        });

        // Verify forward works
        expect(router.forwardState("removeSource", {}).name).toBe("keepTarget");

        // Remove the source route
        router.removeRoute("removeSource");

        // Source route no longer exists
        expect(router.hasRoute("removeSource")).toBe(false);
        // Target should still exist
        expect(router.matchPath("/keep-target")?.name).toBe("keepTarget");
      });
    });

    // 12.3: Removal during active async navigation
    describe("removal during async navigation (12.3)", () => {
      it("should warn when removing route during active navigation", async () => {
        const { logger } = await import("logger");
        const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});

        let resolveCanActivate: () => void;
        const canActivatePromise = new Promise<void>((resolve) => {
          resolveCanActivate = resolve;
        });

        router.addRoute({
          name: "asyncRoute",
          path: "/async-route",
          canActivate: () => async () => {
            await canActivatePromise;

            return true;
          },
        });

        // Start async navigation
        const navigationPromise = new Promise<boolean>((resolve) => {
          router.navigate("asyncRoute", {}, {}, (err) => {
            resolve(!err);
          });
        });

        // Give time for navigation to start
        await new Promise((resolve) => setTimeout(resolve, 10));

        // Try to remove during navigation - should warn but proceed
        router.removeRoute("asyncRoute");

        expect(warnSpy).toHaveBeenCalledWith(
          "router.removeRoute",
          expect.stringContaining("navigation is in progress"),
        );

        // Route should be removed (we only warn, don't block)
        expect(router.matchPath("/async-route")).toBeUndefined();

        // Resolve the canActivate
        resolveCanActivate!();

        // Navigation should fail because route was removed
        const result = await navigationPromise;

        expect(result).toBe(false);

        warnSpy.mockRestore();
      });

      it("should prevent removal when async navigation has completed", async () => {
        const { logger } = await import("logger");
        const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});

        router.addRoute({
          name: "asyncComplete",
          path: "/async-complete",
          canActivate: () => async () => {
            await Promise.resolve();

            return true;
          },
        });

        // Complete navigation first
        await new Promise<void>((resolve) => {
          router.navigate("asyncComplete", {}, {}, () => {
            resolve();
          });
        });

        // Now route is active
        expect(router.getState()?.name).toBe("asyncComplete");

        // Try to remove - should be blocked
        router.removeRoute("asyncComplete");

        expect(warnSpy).toHaveBeenCalledWith(
          "router.removeRoute",
          expect.stringContaining("currently active"),
        );

        // Route should still exist
        expect(router.matchPath("/async-complete")?.name).toBe("asyncComplete");

        warnSpy.mockRestore();
      });

      it("should warn when removing unrelated route during navigation", async () => {
        const { logger } = await import("logger");
        const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});

        let resolveCanActivate: () => void;
        const canActivatePromise = new Promise<void>((resolve) => {
          resolveCanActivate = resolve;
        });

        router.addRoute({
          name: "navigatingTo",
          path: "/navigating-to",
          canActivate: () => async () => {
            await canActivatePromise;

            return true;
          },
        });
        router.addRoute({ name: "unrelated", path: "/unrelated" });

        // Start async navigation to navigatingTo
        const navigationPromise = new Promise<boolean>((resolve) => {
          router.navigate("navigatingTo", {}, {}, (err) => {
            resolve(!err);
          });
        });

        // Give time for navigation to start
        await new Promise((resolve) => setTimeout(resolve, 10));

        // Remove unrelated route during navigation - should warn but proceed
        router.removeRoute("unrelated");

        expect(warnSpy).toHaveBeenCalledWith(
          "router.removeRoute",
          expect.stringContaining("navigation is in progress"),
        );

        // Route should be removed (we only warn, don't block)
        expect(router.matchPath("/unrelated")).toBeUndefined();

        // Complete navigation
        resolveCanActivate!();
        const result = await navigationPromise;

        expect(result).toBe(true);
        expect(router.getState()?.name).toBe("navigatingTo");

        warnSpy.mockRestore();
      });

      it("should handle rapid navigation + removal sequence", async () => {
        router.addRoute({ name: "rapid1", path: "/rapid1" });
        router.addRoute({ name: "rapid2", path: "/rapid2" });
        router.addRoute({ name: "rapid3", path: "/rapid3" });

        // Navigate to rapid1
        await new Promise<void>((resolve) => {
          router.navigate("rapid1", {}, {}, () => {
            resolve();
          });
        });

        // Remove rapid2 (not current) - should work
        router.removeRoute("rapid2");

        expect(router.matchPath("/rapid2")).toBeUndefined();

        // Navigate to rapid3
        await new Promise<void>((resolve) => {
          router.navigate("rapid3", {}, {}, () => {
            resolve();
          });
        });

        // Now rapid1 can be removed (not current anymore)
        router.removeRoute("rapid1");

        expect(router.matchPath("/rapid1")).toBeUndefined();
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
      const { logger } = await import("logger");
      const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});

      // Empty string passes validation (represents root node)
      // but no route has empty name in definitions
      router.removeRoute("");

      expect(warnSpy).toHaveBeenCalledWith(
        "router.removeRoute",
        'Route "" not found. No changes made.',
      );

      warnSpy.mockRestore();
    });

    // 12.5: Very long name (> 10000 characters)
    // MAX_ROUTE_NAME_LENGTH is 10,000 in type-guards package
    it("should throw TypeError for name exceeding 10000 characters", () => {
      const longName = "a".repeat(10_001);

      expect(() => router.removeRoute(longName)).toThrowError(TypeError);
      expect(() => router.removeRoute(longName)).toThrowError(
        /exceeds maximum length/,
      );
    });

    // 12.6: Exact boundary (10000 characters)
    it("should accept name with exactly 10000 characters", async () => {
      const { logger } = await import("logger");
      const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});

      const exactLimit = "a".repeat(10_000);

      // Should not throw - exactly 10000 is valid
      expect(() => router.removeRoute(exactLimit)).not.toThrowError();

      // Route doesn't exist, so graceful handling
      expect(warnSpy).toHaveBeenCalledWith(
        "router.removeRoute",
        expect.stringContaining("not found"),
      );

      warnSpy.mockRestore();
    });

    // 12.7: Unicode characters in name
    it("should throw TypeError for Cyrillic characters in name", () => {
      expect(() => router.removeRoute("маршрут")).toThrowError(TypeError);
    });

    it("should throw TypeError for emoji in name", () => {
      expect(() => router.removeRoute("route_🚀")).toThrowError(TypeError);
    });

    it("should throw TypeError for CJK characters in name", () => {
      expect(() => router.removeRoute("route.日本語")).toThrowError(TypeError);
    });

    // 12.8: System routes (@@prefix)
    it("should handle system route prefix gracefully", async () => {
      const { logger } = await import("logger");
      const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});

      // System routes bypass pattern validation but don't exist
      router.removeRoute("@@real-router/UNKNOWN");

      expect(warnSpy).toHaveBeenCalledWith(
        "router.removeRoute",
        'Route "@@real-router/UNKNOWN" not found. No changes made.',
      );

      warnSpy.mockRestore();
    });

    // 12.9: Deep nesting (10+ levels)
    it("should handle deeply nested route removal (15 levels)", () => {
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

      router.addRoute(deepRoute as Parameters<typeof router.addRoute>[0]);

      // Verify deep route exists
      const deepPath =
        "/level14/level13/level12/level11/level10/level9/level8/level7/level6/level5/level4/level3/level2/level1/leaf";
      const deepName =
        "level14.level13.level12.level11.level10.level9.level8.level7.level6.level5.level4.level3.level2.level1.leaf";

      expect(router.matchPath(deepPath)?.name).toBe(deepName);

      // Remove the deepest leaf
      router.removeRoute(deepName);

      expect(router.matchPath(deepPath)).toBeUndefined();

      // Parent should still exist
      const parentPath =
        "/level14/level13/level12/level11/level10/level9/level8/level7/level6/level5/level4/level3/level2/level1";

      expect(router.matchPath(parentPath)).toBeDefined();
    });

    it("should remove entire deep tree when removing root", () => {
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

      router.addRoute(deepRoute as Parameters<typeof router.addRoute>[0]);

      // Verify routes exist
      expect(router.matchPath("/deep10")).toBeDefined();
      expect(
        router.matchPath(
          "/deep10/deep9/deep8/deep7/deep6/deep5/deep4/deep3/deep2/deep1/leaf",
        ),
      ).toBeDefined();

      // Remove root - all children should be removed
      router.removeRoute("deep10");

      expect(router.matchPath("/deep10")).toBeUndefined();
      expect(
        router.matchPath(
          "/deep10/deep9/deep8/deep7/deep6/deep5/deep4/deep3/deep2/deep1/leaf",
        ),
      ).toBeUndefined();
    });

    // 12.10: Sequential removal of all routes
    it("should handle sequential removal of multiple routes", () => {
      router.addRoute([
        { name: "routeA", path: "/route-a" },
        { name: "routeB", path: "/route-b" },
        { name: "routeC", path: "/route-c" },
      ]);

      expect(router.matchPath("/route-a")).toBeDefined();
      expect(router.matchPath("/route-b")).toBeDefined();
      expect(router.matchPath("/route-c")).toBeDefined();

      router.removeRoute("routeA");

      expect(router.matchPath("/route-a")).toBeUndefined();
      expect(router.matchPath("/route-b")).toBeDefined();
      expect(router.matchPath("/route-c")).toBeDefined();

      router.removeRoute("routeB");

      expect(router.matchPath("/route-a")).toBeUndefined();
      expect(router.matchPath("/route-b")).toBeUndefined();
      expect(router.matchPath("/route-c")).toBeDefined();

      router.removeRoute("routeC");

      expect(router.matchPath("/route-a")).toBeUndefined();
      expect(router.matchPath("/route-b")).toBeUndefined();
      expect(router.matchPath("/route-c")).toBeUndefined();
    });

    it("should allow adding routes after removing all custom routes", () => {
      router.addRoute({ name: "temp1", path: "/temp1" });
      router.addRoute({ name: "temp2", path: "/temp2" });

      router.removeRoute("temp1");
      router.removeRoute("temp2");

      // Should be able to add new routes after clearing
      router.addRoute({ name: "new", path: "/new" });

      expect(router.matchPath("/new")?.name).toBe("new");
    });
  });

  describe("edge cases - prototype pollution (12.17)", () => {
    /**
     * Tests for edge case 12.17 from remove-route-analysis.md
     * Verifies that prototype pollution attempts are handled safely
     */

    it("should handle __proto__ as route name gracefully", async () => {
      const { logger } = await import("logger");
      const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});

      // __proto__ passes pattern validation [a-zA-Z_][a-zA-Z0-9_]*
      // but no such route exists in definitions
      router.removeRoute("__proto__");

      expect(warnSpy).toHaveBeenCalledWith(
        "router.removeRoute",
        'Route "__proto__" not found. No changes made.',
      );

      // Verify no prototype pollution occurred
      expect(Object.prototype.hasOwnProperty.call({}, "polluted")).toBe(false);

      warnSpy.mockRestore();
    });

    it("should handle constructor as route name gracefully", async () => {
      const { logger } = await import("logger");
      const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});

      router.removeRoute("constructor");

      expect(warnSpy).toHaveBeenCalledWith(
        "router.removeRoute",
        'Route "constructor" not found. No changes made.',
      );

      warnSpy.mockRestore();
    });

    it("should handle prototype as route name gracefully", async () => {
      const { logger } = await import("logger");
      const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});

      router.removeRoute("prototype");

      expect(warnSpy).toHaveBeenCalledWith(
        "router.removeRoute",
        'Route "prototype" not found. No changes made.',
      );

      warnSpy.mockRestore();
    });

    it("should not affect Object.prototype when removing __proto__", () => {
      const originalKeys = Object.keys(Object.prototype);

      router.removeRoute("__proto__");

      // Object.prototype should be unchanged
      expect(Object.keys(Object.prototype)).toStrictEqual(originalKeys);
    });

    it("should safely handle nested prototype pollution attempts", async () => {
      const { logger } = await import("logger");
      const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});

      // Try various prototype pollution patterns
      router.removeRoute("__proto__.polluted");
      router.removeRoute("constructor.prototype");

      // Should have warnings for not found (may also include navigation warnings)
      expect(warnSpy).toHaveBeenCalledWith(
        "router.removeRoute",
        expect.stringContaining("not found"),
      );

      warnSpy.mockRestore();
    });
  });

  describe("input validation", () => {
    it("should throw TypeError for null name", () => {
      expect(() => router.removeRoute(null as unknown as string)).toThrowError(
        TypeError,
      );
    });

    it("should throw TypeError for undefined name", () => {
      expect(() =>
        router.removeRoute(undefined as unknown as string),
      ).toThrowError(TypeError);
    });

    it("should throw TypeError for number name", () => {
      expect(() => router.removeRoute(123 as unknown as string)).toThrowError(
        TypeError,
      );
    });

    it("should throw TypeError for object name", () => {
      expect(() => router.removeRoute({} as unknown as string)).toThrowError(
        TypeError,
      );
    });

    it("should throw TypeError for Proxy with overridden toString (12.14)", () => {
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
      expect(() =>
        router.removeRoute(maliciousProxy as unknown as string),
      ).toThrowError(TypeError);

      // Original route should remain untouched
      expect(router.matchPath("/")).toBeDefined();
    });

    it("should throw TypeError for String wrapper object (12.16)", () => {
      // new String() creates an object, not a primitive string
      // eslint-disable-next-line unicorn/new-for-builtins, sonarjs/no-primitive-wrappers
      const stringWrapper = new String("home");

      // typeof stringWrapper === "object", not "string"
      expect(() =>
        router.removeRoute(stringWrapper as unknown as string),
      ).toThrowError(TypeError);

      // Original route should remain untouched
      expect(router.matchPath("/")).toBeDefined();
    });

    it("should throw TypeError for whitespace-only name", () => {
      expect(() => router.removeRoute("   ")).toThrowError(TypeError);
    });

    it("should throw TypeError for name with leading dot", () => {
      expect(() => router.removeRoute(".invalid")).toThrowError(TypeError);
    });

    it("should throw TypeError for name with trailing dot", () => {
      expect(() => router.removeRoute("invalid.")).toThrowError(TypeError);
    });

    it("should throw TypeError for name starting with number", () => {
      expect(() => router.removeRoute("123invalid")).toThrowError(TypeError);
    });

    it("should throw TypeError for name with consecutive dots", () => {
      expect(() => router.removeRoute("invalid..name")).toThrowError(TypeError);
    });
  });
});
