import { describe, it, expect, vi } from "vitest";

import { createTestRouter } from "../../../helpers";

import type { Router } from "@real-router/types";

describe("router.clone()", () => {
  it("should share the route tree with original router", () => {
    const router = createTestRouter();
    const clonedRouter = router.clone();

    // Both routers should recognize the same routes
    expect(router.buildPath("home")).toBe(clonedRouter.buildPath("home"));
    expect(router.buildPath("users.view", { id: "1" })).toBe(
      clonedRouter.buildPath("users.view", { id: "1" }),
    );
  });

  it("should clone plugins", () => {
    const router = createTestRouter();
    const myPlugin = () => ({
      onTransitionSuccess: () => true,
    });

    router.usePlugin(myPlugin);

    const clonedRouter = router.clone();

    expect(clonedRouter.getPlugins()).toContain(myPlugin);
  });

  it("should clone middleware functions", () => {
    const router = createTestRouter();
    const myMiddleware = () => () => true;

    router.useMiddleware(myMiddleware);

    const clonedRouter = router.clone();

    expect(clonedRouter.getMiddlewareFactories()).toContain(myMiddleware);
  });

  it("should clone canActivate handlers", () => {
    const router = createTestRouter();
    const canActivateAdmin = () => () => false;

    router.canActivate("admin", canActivateAdmin);

    const clonedRouter = router.clone();

    expect(clonedRouter.getLifecycleFactories()[1].admin).toStrictEqual(
      canActivateAdmin,
    );
  });

  it("should clone canDeactivate handlers", () => {
    const router = createTestRouter();
    const canDeactivateUser = () => () => true;

    router.canDeactivate("user", canDeactivateUser);

    const clonedRouter = router.clone();

    expect(clonedRouter.getLifecycleFactories()[0].user).toStrictEqual(
      canDeactivateUser,
    );
  });

  it("should clone router options", () => {
    const router = createTestRouter();
    const clonedRouter = router.clone();

    expect(clonedRouter.getOptions()).toStrictEqual(router.getOptions());
    expect(clonedRouter.getOptions()).not.toBe(router.getOptions());
  });

  it("should clone config by value", () => {
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
    expect(clonedRouter.makeState("cloneTest").params).toStrictEqual({
      id: "default",
    });
  });

  it("should make independent router clone: plugins", () => {
    const router = createTestRouter();
    const plugin = () => ({});
    const clonedRouter = router.clone();

    clonedRouter.usePlugin(plugin);

    expect(router.getPlugins()).not.toContain(plugin);
    expect(clonedRouter.getPlugins()).toContain(plugin);
  });

  it("should make independent router clone: middleware", () => {
    const router = createTestRouter();
    const middleware = () => () => true;
    const clonedRouter = router.clone();

    clonedRouter.useMiddleware(middleware);

    expect(router.getMiddlewareFactories()).not.toContain(middleware);
    expect(clonedRouter.getMiddlewareFactories()).toContain(middleware);
  });

  it("should accept new dependencies", () => {
    const router = createTestRouter() as unknown as Router<{ foo: string }>;
    const clonedRouter = router.clone({ foo: "bar" });

    expect(clonedRouter.getDependency("foo")).toBe("bar");
  });

  it("should not share state with original router", () => {
    const router = createTestRouter();

    router.start("/");
    const clonedRouter = router.clone();

    expect(router.isStarted()).toBe(true);
    expect(clonedRouter.isStarted()).toBe(false);
    expect(clonedRouter.getState()).toBeUndefined();
  });

  it("should not share event listeners with original router", () => {
    const router = createTestRouter();
    const listener = vi.fn();

    router.subscribe(listener);

    const clonedRouter = router.clone();

    clonedRouter.start("/");

    // Original router's listener should not be called
    expect(listener).not.toHaveBeenCalled();
  });

  it("should clone config independently (deep copy)", () => {
    const router = createTestRouter();

    router.addRoute({ name: "original", path: "/original" });
    router.addRoute({ name: "redirectTarget", path: "/redirect-target" });
    router.forward("original", "redirectTarget");

    const clonedRouter = router.clone();

    // Clone inherits forward rules from original
    expect(clonedRouter.forwardState("original", {}).name).toBe(
      "redirectTarget",
    );

    // Modify cloned router's forward rules
    clonedRouter.addRoute({ name: "newTarget", path: "/new-target" });
    clonedRouter.forward("original", "newTarget");

    // Original should NOT be affected
    expect(router.forwardState("original", {}).name).toBe("redirectTarget");
    // Clone uses new forward rule
    expect(clonedRouter.forwardState("original", {}).name).toBe("newTarget");
  });

  it("should deep clone defaultParams (nested objects are independent)", () => {
    const router = createTestRouter();

    // Add route with defaultParams
    router.addRoute({
      name: "paginated",
      path: "/paginated",
      defaultParams: { page: 1, sort: "name" },
    });

    const clonedRouter = router.clone();

    // Both have same defaults initially
    expect(router.makeState("paginated").params).toStrictEqual({
      page: 1,
      sort: "name",
    });
    expect(clonedRouter.makeState("paginated").params).toStrictEqual({
      page: 1,
      sort: "name",
    });

    // Update clone's route with different defaults
    clonedRouter.updateRoute("paginated", {
      defaultParams: { page: 2, sort: "name" },
    });

    // Original should NOT be affected
    expect(router.makeState("paginated").params).toStrictEqual({
      page: 1,
      sort: "name",
    });
    // Clone has updated defaults
    expect(clonedRouter.makeState("paginated").params).toStrictEqual({
      page: 2,
      sort: "name",
    });
  });

  // ============================================
  // Argument validation
  // ============================================

  describe("argument validation", () => {
    it("should throw TypeError for invalid dependencies (array)", () => {
      const router = createTestRouter();

      expect(() => router.clone([] as never)).toThrowError(TypeError);
      expect(() => router.clone([] as never)).toThrowError(
        /Invalid dependencies/,
      );
    });

    it("should throw TypeError for invalid dependencies (null)", () => {
      const router = createTestRouter();

      expect(() => router.clone(null as never)).toThrowError(TypeError);
      expect(() => router.clone(null as never)).toThrowError(
        /Invalid dependencies/,
      );
    });

    it("should throw TypeError for invalid dependencies (primitive)", () => {
      const router = createTestRouter();

      expect(() => router.clone("string" as never)).toThrowError(TypeError);
      expect(() => router.clone(123 as never)).toThrowError(
        /Invalid dependencies/,
      );
    });

    it("should throw TypeError for dependencies with getters", () => {
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
    it("should work with empty dependencies (default)", () => {
      const router = createTestRouter();
      const clonedRouter = router.clone();

      expect(clonedRouter).toBeDefined();
      expect(clonedRouter.getDependencies()).toStrictEqual({});
    });

    it("should work with explicit empty object dependencies", () => {
      const router = createTestRouter();
      const clonedRouter = router.clone({});

      expect(clonedRouter).toBeDefined();
      expect(clonedRouter.getDependencies()).toStrictEqual({});
    });

    it("should work when router has no middleware", () => {
      const router = createTestRouter();
      // Don't add any middleware
      const clonedRouter = router.clone();

      expect(clonedRouter.getMiddlewareFactories()).toHaveLength(0);
    });

    it("should work when router has no plugins", () => {
      const router = createTestRouter();
      // Don't add any plugins
      const clonedRouter = router.clone();

      expect(clonedRouter.getPlugins()).toHaveLength(0);
    });

    it("should clone lifecycle handlers from route definitions", () => {
      const router = createTestRouter();
      // createTestRouter has routes with canActivate defined (admin, auth-protected)
      const clonedRouter = router.clone();

      const [canDeactivate, canActivate] = clonedRouter.getLifecycleFactories();
      const [origDeactivate, origActivate] = router.getLifecycleFactories();

      // Should have same lifecycle handlers as original
      expect(Object.keys(canActivate)).toStrictEqual(Object.keys(origActivate));
      expect(Object.keys(canDeactivate)).toStrictEqual(
        Object.keys(origDeactivate),
      );
    });

    it("should clone config including route-defined encoders/decoders", () => {
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

    it("should clone router with complex config", () => {
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
      router.forward("complexRoute", "targetRoute");

      const clonedRouter = router.clone();

      // Clone should have same behavior
      expect(clonedRouter.hasRoute("complexRoute")).toBe(true);
      expect(clonedRouter.makeState("complexRoute").params).toStrictEqual({
        id: "default",
        page: 1,
      });
      expect(
        clonedRouter.forwardState("complexRoute", { id: "1", page: 1 }).name,
      ).toBe("targetRoute");

      // Modify clone
      clonedRouter.updateRoute("complexRoute", {
        defaultParams: { id: "default", page: 2 },
      });

      // Original should NOT be affected
      expect(router.makeState("complexRoute").params).toStrictEqual({
        id: "default",
        page: 1,
      });
      // Clone has updated defaults
      expect(clonedRouter.makeState("complexRoute").params).toStrictEqual({
        id: "default",
        page: 2,
      });
    });

    it("should clone multiple middleware in correct order", () => {
      const router = createTestRouter();
      const middleware1 = () => () => true;
      const middleware2 = () => () => false;
      const middleware3 = () => () => true;

      router.useMiddleware(middleware1, middleware2, middleware3);

      const clonedRouter = router.clone();
      const factories = clonedRouter.getMiddlewareFactories();

      expect(factories).toHaveLength(3);
      expect(factories[0]).toBe(middleware1);
      expect(factories[1]).toBe(middleware2);
      expect(factories[2]).toBe(middleware3);
    });

    it("should clone multiple plugins in correct order", () => {
      const router = createTestRouter();
      const plugin1 = () => ({ onStart: () => {} });
      const plugin2 = () => ({ onStop: () => {} });

      router.usePlugin(plugin1, plugin2);

      const clonedRouter = router.clone();
      const plugins = clonedRouter.getPlugins();

      expect(plugins).toHaveLength(2);
      expect(plugins[0]).toBe(plugin1);
      expect(plugins[1]).toBe(plugin2);
    });

    it("should clone multiple lifecycle handlers", () => {
      const router = createTestRouter();
      const canActivateA = () => () => true;
      const canActivateB = () => () => false;
      const canDeactivateA = () => () => true;

      router.canActivate("home", canActivateA);
      router.canActivate("users", canActivateB);
      router.canDeactivate("admin", canDeactivateA);

      const clonedRouter = router.clone();
      const [canDeactivate, canActivate] = clonedRouter.getLifecycleFactories();

      expect(canActivate.home).toBe(canActivateA);
      expect(canActivate.users).toBe(canActivateB);
      expect(canDeactivate.admin).toBe(canDeactivateA);
    });

    it("should support chain cloning (clone of clone) with proper isolation", () => {
      const router = createTestRouter();
      const middleware1 = () => () => true;
      const plugin1 = () => ({});

      router.useMiddleware(middleware1);

      // First level clone
      const clone1 = router.clone();
      const middleware2 = () => () => false;
      const plugin2 = () => ({});

      clone1.useMiddleware(middleware2);
      clone1.usePlugin(plugin1);

      // Second level clone (clone of clone)
      const clone2 = clone1.clone();
      const middleware3 = () => () => true;

      clone2.useMiddleware(middleware3);
      clone2.usePlugin(plugin2);

      // Verify middleware isolation at each level
      expect(router.getMiddlewareFactories()).toHaveLength(1);
      expect(router.getMiddlewareFactories()).toContain(middleware1);
      expect(router.getMiddlewareFactories()).not.toContain(middleware2);

      expect(clone1.getMiddlewareFactories()).toHaveLength(2);
      expect(clone1.getMiddlewareFactories()).toContain(middleware1);
      expect(clone1.getMiddlewareFactories()).toContain(middleware2);
      expect(clone1.getMiddlewareFactories()).not.toContain(middleware3);

      expect(clone2.getMiddlewareFactories()).toHaveLength(3);
      expect(clone2.getMiddlewareFactories()).toContain(middleware1);
      expect(clone2.getMiddlewareFactories()).toContain(middleware2);
      expect(clone2.getMiddlewareFactories()).toContain(middleware3);

      // Verify plugin isolation
      expect(router.getPlugins()).toHaveLength(0);
      expect(clone1.getPlugins()).toHaveLength(1);
      expect(clone1.getPlugins()).toContain(plugin1);
      expect(clone2.getPlugins()).toHaveLength(2);
      expect(clone2.getPlugins()).toContain(plugin1);
      expect(clone2.getPlugins()).toContain(plugin2);

      // Verify routes are still shared across all levels
      expect(router.buildPath("home")).toBe(clone1.buildPath("home"));
      expect(clone1.buildPath("home")).toBe(clone2.buildPath("home"));
    });

    it("should clone both canActivate and canDeactivate for same route", () => {
      const router = createTestRouter();
      const canActivateHome = () => () => true;
      const canDeactivateHome = () => () => false;

      // Same route has both lifecycle handlers
      router.canActivate("home", canActivateHome);
      router.canDeactivate("home", canDeactivateHome);

      const clonedRouter = router.clone();

      const [origDeactivate, origActivate] = router.getLifecycleFactories();
      const [cloneDeactivate, cloneActivate] =
        clonedRouter.getLifecycleFactories();

      // Both handlers should be cloned for the same route
      expect(cloneActivate.home).toBe(canActivateHome);
      expect(cloneDeactivate.home).toBe(canDeactivateHome);

      // Should match original
      expect(cloneActivate.home).toBe(origActivate.home);
      expect(cloneDeactivate.home).toBe(origDeactivate.home);

      // Handlers should be independent (adding to clone doesn't affect original)
      const newHandler = () => () => true;

      clonedRouter.canActivate("users", newHandler);

      expect(clonedRouter.getLifecycleFactories()[1].users).toBe(newHandler);
      expect(router.getLifecycleFactories()[1].users).toBeUndefined();
    });
  });
});
