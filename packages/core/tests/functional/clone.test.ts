import { describe, it, expect, vi } from "vitest";

import {
  errorCodes,
  getDependenciesApi,
  getPluginApi,
} from "@real-router/core";

import { createTestRouter } from "../helpers";

import type { Router, RouterError } from "@real-router/core";

/**
 * Creates a trackable plugin that records when its hooks are called.
 */
function createTrackingPlugin(id: string, orderTracker?: string[]) {
  const calls = {
    onStart: 0,
    onStop: 0,
    onTransitionSuccess: 0,
  };

  return {
    factory: () => ({
      onStart: () => {
        calls.onStart++;
        orderTracker?.push(`${id}-start`);
      },
      onStop: () => {
        calls.onStop++;
        orderTracker?.push(`${id}-stop`);
      },
      onTransitionSuccess: () => {
        calls.onTransitionSuccess++;
        orderTracker?.push(`${id}-transition`);
      },
    }),
    getCalls: () => ({ ...calls }),
    reset: () => {
      calls.onStart = 0;
      calls.onStop = 0;
      calls.onTransitionSuccess = 0;
    },
  };
}

describe("router.clone()", () => {
  it("should share the route tree with original router", async () => {
    const router = createTestRouter();
    const clonedRouter = router.clone();

    // Both routers should recognize the same routes
    expect(router.buildPath("home")).toBe(clonedRouter.buildPath("home"));
    expect(router.buildPath("users.view", { id: "1" })).toBe(
      clonedRouter.buildPath("users.view", { id: "1" }),
    );
  });

  it("should clone plugins", async () => {
    const router = createTestRouter();
    const tracker = createTrackingPlugin("plugin");

    router.usePlugin(tracker.factory);

    const clonedRouter = router.clone();

    // Verify plugin is cloned by checking it responds to events on cloned router
    await clonedRouter.start("/home");

    expect(tracker.getCalls().onStart).toBe(1);

    clonedRouter.stop();
  });

  it("should clone canActivate handlers", async () => {
    const router = createTestRouter();
    const canActivateGuard = vi.fn().mockReturnValue(false);

    router.addActivateGuard("admin", () => canActivateGuard);

    const clonedRouter = router.clone();

    await clonedRouter.start("/");

    // Verify canActivate is cloned - navigation to admin should be blocked
    try {
      await clonedRouter.navigate("admin");

      expect.fail("Should have thrown");
    } catch (error) {
      expect((error as RouterError).code).toBe(errorCodes.CANNOT_ACTIVATE);
      expect(canActivateGuard).toHaveBeenCalled();
    }

    clonedRouter.stop();
  });

  it("should clone canDeactivate handlers", async () => {
    const router = createTestRouter();
    const canDeactivateGuard = vi.fn().mockReturnValue(false);

    router.addDeactivateGuard("users", () => canDeactivateGuard);

    const clonedRouter = router.clone();

    await clonedRouter.start("/");

    // Navigate to users first
    const state1 = await clonedRouter.navigate("users");

    expect(state1).toBeDefined();

    // Verify canDeactivate is cloned - leaving users should be blocked
    try {
      await clonedRouter.navigate("home");

      expect.fail("Should have thrown");
    } catch (error) {
      expect((error as RouterError).code).toBe(errorCodes.CANNOT_DEACTIVATE);
      expect(canDeactivateGuard).toHaveBeenCalled();
    }

    clonedRouter.stop();
  });

  it("should clone router options", async () => {
    const router = createTestRouter();
    const clonedRouter = router.clone();

    expect(getPluginApi(clonedRouter).getOptions()).toStrictEqual(
      getPluginApi(router).getOptions(),
    );
    expect(getPluginApi(clonedRouter).getOptions()).not.toBe(
      getPluginApi(router).getOptions(),
    );
  });

  it("should clone config by value", async () => {
    const router = createTestRouter();

    // Add some config to verify
    router.addRoute({
      name: "cloneTest",
      path: "/clone-test/:id",
      defaultParams: { id: "default" },
    });

    const clonedRouter = router.clone();

    // Clone has same routes and behavior as original
    expect(clonedRouter.hasRoute("cloneTest")).toBe(true);
    expect(
      getPluginApi(clonedRouter).makeState("cloneTest").params,
    ).toStrictEqual({
      id: "default",
    });
  });

  it("should make independent router clone: plugins", async () => {
    const router = createTestRouter();
    const tracker = createTrackingPlugin("plugin");
    const clonedRouter = router.clone();

    // Add plugin only to cloned router
    clonedRouter.usePlugin(tracker.factory);

    // Start both routers
    await router.start("/home");
    await clonedRouter.start("/home");

    // Plugin should only respond on cloned router (2 starts: router + clonedRouter)
    // But we added plugin only to clonedRouter, so only 1 start
    expect(tracker.getCalls().onStart).toBe(1);

    router.stop();
    clonedRouter.stop();
  });

  it("should accept new dependencies", async () => {
    const router = createTestRouter() as unknown as Router<{ foo: string }>;
    const clonedRouter = router.clone({ foo: "bar" });

    const deps = getDependenciesApi(clonedRouter);

    expect(deps.get("foo")).toBe("bar");
  });

  it("should not share state with original router", async () => {
    const router = createTestRouter();

    await router.start("/");
    const clonedRouter = router.clone();

    expect(router.isActive()).toBe(true);
    expect(clonedRouter.isActive()).toBe(false);
    expect(clonedRouter.getState()).toBeUndefined();
  });

  it("should not share event listeners with original router", async () => {
    const router = createTestRouter();
    const listener = vi.fn();

    router.subscribe(listener);

    const clonedRouter = router.clone();

    await clonedRouter.start("/");

    // Original router's listener should not be called
    expect(listener).not.toHaveBeenCalled();
  });

  it("should clone config independently (deep copy)", async () => {
    const router = createTestRouter();

    router.addRoute({ name: "original", path: "/original" });
    router.addRoute({ name: "redirectTarget", path: "/redirect-target" });
    router.updateRoute("original", { forwardTo: "redirectTarget" });

    const clonedRouter = router.clone();

    // Clone inherits forward rules from original
    expect(getPluginApi(clonedRouter).forwardState("original", {}).name).toBe(
      "redirectTarget",
    );

    // Modify cloned router's forward rules
    clonedRouter.addRoute({ name: "newTarget", path: "/new-target" });
    clonedRouter.updateRoute("original", { forwardTo: "newTarget" });

    // Original should NOT be affected
    expect(getPluginApi(router).forwardState("original", {}).name).toBe(
      "redirectTarget",
    );
    // Clone uses new forward rule
    expect(getPluginApi(clonedRouter).forwardState("original", {}).name).toBe(
      "newTarget",
    );
  });

  it("should deep clone defaultParams (nested objects are independent)", async () => {
    const router = createTestRouter();

    // Add route with defaultParams
    router.addRoute({
      name: "paginated",
      path: "/paginated",
      defaultParams: { page: 1, sort: "name" },
    });

    const clonedRouter = router.clone();

    // Both have same defaults initially
    expect(getPluginApi(router).makeState("paginated").params).toStrictEqual({
      page: 1,
      sort: "name",
    });
    expect(
      getPluginApi(clonedRouter).makeState("paginated").params,
    ).toStrictEqual({
      page: 1,
      sort: "name",
    });

    // Update clone's route with different defaults
    clonedRouter.updateRoute("paginated", {
      defaultParams: { page: 2, sort: "name" },
    });

    // Original should NOT be affected
    expect(getPluginApi(router).makeState("paginated").params).toStrictEqual({
      page: 1,
      sort: "name",
    });
    // Clone has updated defaults
    expect(
      getPluginApi(clonedRouter).makeState("paginated").params,
    ).toStrictEqual({
      page: 2,
      sort: "name",
    });
  });

  // ============================================
  // Argument validation
  // ============================================

  describe("argument validation", () => {
    it("should throw TypeError for invalid dependencies (array)", async () => {
      const router = createTestRouter();

      expect(() => router.clone([] as never)).toThrowError(TypeError);
      expect(() => router.clone([] as never)).toThrowError(
        /Invalid dependencies/,
      );
    });

    it("should throw TypeError for invalid dependencies (null)", async () => {
      const router = createTestRouter();

      expect(() => router.clone(null as never)).toThrowError(TypeError);
      expect(() => router.clone(null as never)).toThrowError(
        /Invalid dependencies/,
      );
    });

    it("should throw TypeError for invalid dependencies (primitive)", async () => {
      const router = createTestRouter();

      expect(() => router.clone("string" as never)).toThrowError(TypeError);
      expect(() => router.clone(123 as never)).toThrowError(
        /Invalid dependencies/,
      );
    });

    it("should throw TypeError for dependencies with getters", async () => {
      const router = createTestRouter();
      const depsWithGetter = {};

      Object.defineProperty(depsWithGetter, "foo", {
        get() {
          return "bar";
        },
        enumerable: true,
      });

      expect(() => router.clone(depsWithGetter as never)).toThrowError(
        TypeError,
      );
      expect(() => router.clone(depsWithGetter as never)).toThrowError(
        /Getters not allowed/,
      );
    });
  });

  // ============================================
  // Error handling and edge cases
  // ============================================

  describe("error handling", () => {
    it("should work with empty dependencies (default)", async () => {
      const router = createTestRouter();
      const clonedRouter = router.clone();

      expect(clonedRouter).toBeDefined();

      const deps = getDependenciesApi(clonedRouter);

      expect(deps.getAll()).toStrictEqual({});
    });

    it("should work with explicit empty object dependencies", async () => {
      const router = createTestRouter();
      const clonedRouter = router.clone({});

      expect(clonedRouter).toBeDefined();

      const deps = getDependenciesApi(clonedRouter);

      expect(deps.getAll()).toStrictEqual({});
    });

    it("should work when router has no middleware", async () => {
      const router = createTestRouter();
      // Don't add any middleware
      const clonedRouter = router.clone();

      // Clone should work without errors
      expect(clonedRouter).toBeDefined();

      await clonedRouter.start("/");

      const state = await clonedRouter.navigate("users");

      expect(state).toBeDefined();

      clonedRouter.stop();
    });

    it("should work when router has no plugins", async () => {
      const router = createTestRouter();
      // Don't add any plugins
      const clonedRouter = router.clone();

      // Clone should work without errors
      expect(clonedRouter).toBeDefined();

      await clonedRouter.start("/");
      clonedRouter.stop();
    });

    it("should clone lifecycle handlers from route definitions", async () => {
      const router = createTestRouter();
      // createTestRouter has routes with canActivate defined
      const clonedRouter = router.clone();

      await clonedRouter.start("/");

      // Verify lifecycle handlers are cloned by testing navigation behavior
      // The "admin-protected" route has canActivate that blocks navigation
      try {
        await clonedRouter.navigate("admin-protected");

        expect.fail("Should have thrown");
      } catch (error) {
        // If lifecycle handlers are cloned, admin-protected should be blocked
        expect((error as RouterError).code).toBe(errorCodes.CANNOT_ACTIVATE);
      }

      clonedRouter.stop();
    });

    it("should clone config including route-defined encoders/decoders", async () => {
      const router = createTestRouter();
      // createTestRouter has withEncoder route with encodeParams/decodeParams
      const clonedRouter = router.clone();

      // Both routers should have same routes
      expect(router.hasRoute("withEncoder")).toBe(true);
      expect(clonedRouter.hasRoute("withEncoder")).toBe(true);

      // Both should apply same encoding/decoding behavior
      const encodedPath = router.buildPath("withEncoder", {
        one: "a",
        two: "b",
      });
      const clonedEncodedPath = clonedRouter.buildPath("withEncoder", {
        one: "a",
        two: "b",
      });

      expect(encodedPath).toBe(clonedEncodedPath);
    });

    it("should clone router with complex config", async () => {
      const router = createTestRouter();

      // Add routes with encoders, decoders, defaultParams, and forwards via API
      router.addRoute({
        name: "complexRoute",
        path: "/complex/:id",
        decodeParams: (params) => ({ ...params, decoded: true }),
        encodeParams: (params) => ({ ...params, encoded: true }),
        defaultParams: { id: "default", page: 1 },
      });
      router.addRoute({ name: "targetRoute", path: "/target" });
      router.updateRoute("complexRoute", { forwardTo: "targetRoute" });

      const clonedRouter = router.clone();

      // Clone should have same behavior
      expect(clonedRouter.hasRoute("complexRoute")).toBe(true);
      expect(
        getPluginApi(clonedRouter).makeState("complexRoute").params,
      ).toStrictEqual({
        id: "default",
        page: 1,
      });
      expect(
        getPluginApi(clonedRouter).forwardState("complexRoute", {
          id: "1",
          page: 1,
        }).name,
      ).toBe("targetRoute");

      // Modify clone
      clonedRouter.updateRoute("complexRoute", {
        defaultParams: { id: "default", page: 2 },
      });

      // Original should NOT be affected
      expect(
        getPluginApi(router).makeState("complexRoute").params,
      ).toStrictEqual({
        id: "default",
        page: 1,
      });
      // Clone has updated defaults
      expect(
        getPluginApi(clonedRouter).makeState("complexRoute").params,
      ).toStrictEqual({
        id: "default",
        page: 2,
      });
    });

    it("should clone multiple plugins in correct order", async () => {
      const router = createTestRouter();
      const orderTracker: string[] = [];
      const plugin1 = createTrackingPlugin("p1", orderTracker);
      const plugin2 = createTrackingPlugin("p2", orderTracker);

      router.usePlugin(plugin1.factory, plugin2.factory);

      const clonedRouter = router.clone();

      await clonedRouter.start("/");

      // Verify order is preserved (both onStart should be called in order)
      expect(orderTracker).toContain("p1-start");
      expect(orderTracker).toContain("p2-start");
      expect(orderTracker.indexOf("p1-start")).toBeLessThan(
        orderTracker.indexOf("p2-start"),
      );

      clonedRouter.stop();
    });

    it("should clone multiple lifecycle handlers", async () => {
      const router = createTestRouter();
      const canActivateHome = vi.fn().mockReturnValue(true);
      const canActivateUsers = vi.fn().mockReturnValue(true);
      const canDeactivateAdmin = vi.fn().mockReturnValue(true);

      router.addActivateGuard("home", () => canActivateHome);
      router.addActivateGuard("users", () => canActivateUsers);
      router.addDeactivateGuard("admin", () => canDeactivateAdmin);

      const clonedRouter = router.clone();

      await clonedRouter.start("/");

      // Verify canActivate handlers are cloned
      const state1 = await clonedRouter.navigate("home");

      expect(state1).toBeDefined();
      expect(canActivateHome).toHaveBeenCalled();

      const state2 = await clonedRouter.navigate("users");

      expect(state2).toBeDefined();
      expect(canActivateUsers).toHaveBeenCalled();

      // Verify canDeactivate handler is cloned - navigate to admin then leave
      const state3 = await clonedRouter.navigate("admin");

      expect(state3).toBeDefined();

      const state4 = await clonedRouter.navigate("home");

      expect(state4).toBeDefined();
      expect(canDeactivateAdmin).toHaveBeenCalled();

      clonedRouter.stop();
    });

    it("should support chain cloning (clone of clone) with proper isolation", async () => {
      const router = createTestRouter();
      const plugin1Tracker = createTrackingPlugin("p1");
      const plugin2Tracker = createTrackingPlugin("p2");

      const clone1 = router.clone();

      clone1.usePlugin(plugin1Tracker.factory);

      const clone2 = clone1.clone();

      clone2.usePlugin(plugin2Tracker.factory);

      await router.start("/");
      await clone1.start("/");
      await clone2.start("/");

      expect(plugin1Tracker.getCalls().onStart).toBe(2);
      expect(plugin2Tracker.getCalls().onStart).toBe(1);

      expect(router.buildPath("home")).toBe(clone1.buildPath("home"));
      expect(clone1.buildPath("home")).toBe(clone2.buildPath("home"));

      router.stop();
      clone1.stop();
      clone2.stop();
    });

    it("should clone both canActivate and canDeactivate for same route", async () => {
      const router = createTestRouter();
      const canActivateHome = vi.fn().mockReturnValue(true);
      const canDeactivateHome = vi.fn().mockReturnValue(true);

      // Same route has both lifecycle handlers
      router.addActivateGuard("home", () => canActivateHome);
      router.addDeactivateGuard("home", () => canDeactivateHome);

      const clonedRouter = router.clone();

      await clonedRouter.start("/");

      // Navigate to home to trigger canActivate
      const state1 = await clonedRouter.navigate("home");

      expect(state1).toBeDefined();
      expect(canActivateHome).toHaveBeenCalled();

      // Navigate away to trigger canDeactivate
      const state2 = await clonedRouter.navigate("users");

      expect(state2).toBeDefined();
      expect(canDeactivateHome).toHaveBeenCalled();

      // Verify handlers are independent - adding to clone doesn't affect original
      const newHandler = vi.fn().mockReturnValue(true);

      clonedRouter.addActivateGuard("orders", () => newHandler);

      // Navigate on cloned router
      const state3 = await clonedRouter.navigate("orders");

      expect(state3).toBeDefined();
      expect(newHandler).toHaveBeenCalled();

      // Original router should not have the new handler
      newHandler.mockClear();
      await router.start("/");

      const state4 = await router.navigate("orders");

      expect(state4).toBeDefined();
      // Handler was NOT added to original, so it should NOT be called
      expect(newHandler).not.toHaveBeenCalled();

      router.stop();
      clonedRouter.stop();
    });

    it("should preserve canDeactivate from route config", async () => {
      const router = createTestRouter();
      const guard = vi.fn().mockReturnValue(false);

      router.addRoute({
        name: "workspace",
        path: "/workspace",
        canDeactivate: () => guard,
      });

      const clonedRouter = router.clone();

      await clonedRouter.start("/");

      const state1 = await clonedRouter.navigate("workspace");

      expect(state1).toBeDefined();

      guard.mockClear();

      try {
        await clonedRouter.navigate("home");

        expect.fail("Should have thrown");
      } catch (error) {
        expect((error as RouterError).code).toBe(errorCodes.CANNOT_DEACTIVATE);
        expect(guard).toHaveBeenCalled();
      }

      router.stop();
      clonedRouter.stop();
    });
  });

  describe("forwardFnMap cloning", () => {
    it("should preserve forwardFnMap in cloned router", async () => {
      const router = createTestRouter();
      const forwardFn = () => "clone-target";

      router.addRoute({ name: "clone-target", path: "/clone-target" });
      router.addRoute({
        name: "clone-forward",
        path: "/clone-forward",
        forwardTo: forwardFn,
      });

      const clonedRouter = router.clone();

      const originalRoute = router.getRoute("clone-forward");
      const clonedRoute = clonedRouter.getRoute("clone-forward");

      expect(originalRoute?.forwardTo).toBe(forwardFn);
      expect(clonedRoute?.forwardTo).toBe(forwardFn);

      const clonedResult = getPluginApi(clonedRouter).forwardState(
        "clone-forward",
        {},
      );

      expect(clonedResult.name).toBe("clone-target");
    });
  });
});
