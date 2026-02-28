import { logger } from "@real-router/logger";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import {
  createRouter,
  getLifecycleApi,
  getPluginApi,
  getRoutesApi,
} from "@real-router/core";

import { createTestRouter } from "../../../helpers";

import type { LifecycleApi, Router, RoutesApi } from "@real-router/core";

let router: Router;
let routesApi: RoutesApi;
let lifecycle: LifecycleApi;

describe("core/routes/replaceRoutes", () => {
  beforeEach(async () => {
    router = createTestRouter();
    routesApi = getRoutesApi(router);
    lifecycle = getLifecycleApi(router);
    await router.start("/home");
  });

  afterEach(() => {
    try {
      router.stop();
    } catch {
      // router may have been disposed in the test
    }
  });

  // ============================================================================
  // Basic functionality
  // ============================================================================

  describe("basic functionality", () => {
    it("should replace all routes with new ones", () => {
      // Verify old route exists before replace
      expect(getPluginApi(router).matchPath("/home")).toBeDefined();

      routesApi.replace([
        { name: "new-home", path: "/new-home" },
        { name: "new-about", path: "/new-about" },
      ]);

      // Old routes are gone
      expect(getPluginApi(router).matchPath("/home")).toBeUndefined();
      // New routes are accessible
      expect(getPluginApi(router).matchPath("/new-home")?.name).toBe(
        "new-home",
      );
      expect(getPluginApi(router).matchPath("/new-about")?.name).toBe(
        "new-about",
      );
    });

    it("should accept a single route (not array)", () => {
      routesApi.replace({ name: "single", path: "/single" });

      expect(routesApi.has("single")).toBe(true);
      expect(routesApi.has("home")).toBe(false);
    });

    it("should clear all routes when replaced with empty array", () => {
      expect(getPluginApi(router).matchPath("/home")).toBeDefined();

      routesApi.replace([]);

      expect(getPluginApi(router).matchPath("/home")).toBeUndefined();
      expect(getPluginApi(router).matchPath("/")).toBeUndefined();
    });

    it("should make old routes inaccessible after replace (has returns false)", () => {
      // createTestRouter has home, users, admin etc.
      expect(routesApi.has("home")).toBe(true);
      expect(routesApi.has("users")).toBe(true);

      routesApi.replace([{ name: "fresh", path: "/fresh" }]);

      expect(routesApi.has("home")).toBe(false);
      expect(routesApi.has("users")).toBe(false);
    });

    it("should make new routes accessible via has() after replace", () => {
      expect(routesApi.has("brand-new")).toBe(false);

      routesApi.replace([
        { name: "brand-new", path: "/brand-new" },
        { name: "another-new", path: "/another-new" },
      ]);

      expect(routesApi.has("brand-new")).toBe(true);
      expect(routesApi.has("another-new")).toBe(true);
    });
  });

  // ============================================================================
  // Configuration cleanup and registration
  // ============================================================================

  describe("configuration cleanup and registration", () => {
    it("should clear decoders of old routes after replace", () => {
      const decodeParams = vi.fn((params) => ({
        ...params,
        decoded: true,
      }));

      routesApi.add({
        name: "with-decoder",
        path: "/with-decoder/:id",
        decodeParams,
      });

      // Decoder works before replace
      expect(
        getPluginApi(router).matchPath("/with-decoder/123")?.params.decoded,
      ).toBe(true);
      expect(decodeParams).toHaveBeenCalledTimes(1);

      // Replace removes old routes
      routesApi.replace([{ name: "fresh", path: "/fresh" }]);

      // Old route is gone
      expect(
        getPluginApi(router).matchPath("/with-decoder/123"),
      ).toBeUndefined();
      // Decoder was not called again
      expect(decodeParams).toHaveBeenCalledTimes(1);
    });

    it("should register decoders/encoders of new routes after replace", () => {
      const decode = vi.fn((params) => ({ ...params, id: Number(params.id) }));
      const encode = vi.fn((params) => ({
        ...params,
        id: String(params.id),
      }));

      routesApi.replace([
        {
          name: "new-with-codecs",
          path: "/new-with-codecs/:id",
          decodeParams: decode,
          encodeParams: encode,
        },
      ]);

      // Decoder is registered and works
      const state = getPluginApi(router).matchPath("/new-with-codecs/42");

      expect(decode).toHaveBeenCalled();
      expect(state?.params.id).toBe(42);

      // Encoder is registered and works
      router.buildPath("new-with-codecs", { id: 42 });

      expect(encode).toHaveBeenCalled();
    });

    it("should clear defaultParams of old routes after replace", () => {
      routesApi.add({
        name: "with-defaults",
        path: "/with-defaults",
        defaultParams: { page: 1, limit: 10 },
      });

      // Defaults work before replace
      expect(
        getPluginApi(router).makeState("with-defaults").params,
      ).toStrictEqual({ page: 1, limit: 10 });

      routesApi.replace([{ name: "new-route", path: "/new-route" }]);

      expect(routesApi.has("with-defaults")).toBe(false);
    });

    it("should register defaultParams of new routes after replace", () => {
      routesApi.replace([
        {
          name: "new-with-defaults",
          path: "/new-with-defaults",
          defaultParams: { tab: "overview" },
        },
      ]);

      const state = getPluginApi(router).makeState("new-with-defaults");

      expect(state.params).toStrictEqual({ tab: "overview" });
    });

    it("should recalculate forwardMap with no stale entries", () => {
      routesApi.add({ name: "target", path: "/target" });
      routesApi.add({
        name: "redirect",
        path: "/redirect",
        forwardTo: "target",
      });

      // Forward works before replace
      expect(getPluginApi(router).forwardState("redirect", {}).name).toBe(
        "target",
      );

      // Replace with fresh routes — old redirect is gone
      routesApi.replace([
        { name: "new-a", path: "/new-a" },
        { name: "new-b", path: "/new-b", forwardTo: "new-a" },
      ]);

      // Old redirect is gone
      expect(routesApi.has("redirect")).toBe(false);
      // New forward works
      expect(getPluginApi(router).forwardState("new-b", {}).name).toBe("new-a");
    });

    it("should clear custom fields of old routes after replace", () => {
      // Add a route with a custom field
      routesApi.add({
        name: "with-custom",
        path: "/with-custom",
        ...({ someCustomField: "custom-value" } as Record<string, unknown>),
      } as any);

      // Verify custom field is registered
      const configBefore = routesApi.getConfig("with-custom");

      expect(configBefore?.someCustomField).toBe("custom-value");

      routesApi.replace([{ name: "fresh", path: "/fresh" }]);

      // Old route with custom field is gone
      expect(routesApi.has("with-custom")).toBe(false);
      expect(routesApi.getConfig("with-custom")).toBeUndefined();
    });
  });

  // ============================================================================
  // Lifecycle handlers
  // ============================================================================

  describe("lifecycle handlers", () => {
    it("should clear definition guards of old routes on replace", async () => {
      routesApi.add({
        name: "protected",
        path: "/protected",
        canActivate: () => () => false, // blocking definition guard
      });

      // Guard blocks navigation before replace
      await expect(router.navigate("protected")).rejects.toThrowError();

      // Replace: re-add same route path but without guard
      routesApi.replace([
        { name: "home", path: "/home" },
        { name: "protected", path: "/protected" }, // no guard
      ]);

      // Definition guard is cleared — navigation works now
      await router.navigate("protected");

      expect(router.getState()?.name).toBe("protected");
    });

    it("should register definition guards of new routes on replace", async () => {
      routesApi.replace([
        {
          name: "new-protected",
          path: "/new-protected",
          canActivate: () => () => false, // blocking guard
        },
      ]);

      // Guard is registered for new route
      await expect(router.navigate("new-protected")).rejects.toThrowError();
    });

    it("should preserve external guards (addActivateGuard) on replace", async () => {
      routesApi.add({ name: "ext-guarded", path: "/ext-guarded" });
      lifecycle.addActivateGuard("ext-guarded", () => () => false); // external guard

      // External guard blocks navigation
      await expect(router.navigate("ext-guarded")).rejects.toThrowError();

      // Replace: re-add the route
      routesApi.replace([
        { name: "home", path: "/home" },
        { name: "ext-guarded", path: "/ext-guarded" },
      ]);

      // External guard is STILL preserved — navigation still blocked
      await expect(router.navigate("ext-guarded")).rejects.toThrowError();
    });

    it("should preserve external guard for removed route (usable after re-add)", async () => {
      routesApi.add({ name: "removed-route", path: "/removed" });
      lifecycle.addActivateGuard("removed-route", () => () => false);

      // Replace removing the route
      routesApi.replace([{ name: "home", path: "/home" }]);

      // Route is gone
      expect(routesApi.has("removed-route")).toBe(false);

      // Add route back
      routesApi.add({ name: "removed-route", path: "/removed" });

      // External guard is still in place
      await expect(router.navigate("removed-route")).rejects.toThrowError();
    });

    it("should treat routesApi.update({ canActivate }) as definition guard (cleared on replace)", async () => {
      routesApi.add({ name: "updated", path: "/updated" });
      routesApi.update("updated", { canActivate: () => () => false }); // definition guard via update

      // Update-registered guard blocks navigation
      await expect(router.navigate("updated")).rejects.toThrowError();

      // Replace with same route but no guard
      routesApi.replace([
        { name: "home", path: "/home" },
        { name: "updated", path: "/updated" },
      ]);

      // Guard is cleared (definition guard from update is tracked and removed)
      await router.navigate("updated");

      expect(router.getState()?.name).toBe("updated");
    });

    it("should handle definition canActivate + external canDeactivate on replace correctly", async () => {
      routesApi.add({
        name: "cross-type",
        path: "/cross-type",
        canActivate: () => () => false, // definition activate guard
      });
      lifecycle.addDeactivateGuard("cross-type", () => () => false); // external deactivate guard

      // Navigate to home first so we can test deactivate
      await router.navigate("index");

      // After replace with same route but no canActivate:
      routesApi.replace([
        { name: "home", path: "/home" },
        { name: "cross-type", path: "/cross-type" }, // no canActivate
      ]);

      // Definition canActivate is cleared — can navigate to the route
      await router.navigate("cross-type");

      expect(router.getState()?.name).toBe("cross-type");

      // External canDeactivate is preserved — cannot leave the route
      await expect(router.navigate("home")).rejects.toThrowError();
    });

    it("should preserve external canDeactivate guards on replace", async () => {
      routesApi.add({ name: "sticky", path: "/sticky" });
      lifecycle.addDeactivateGuard("sticky", () => () => false);

      await router.navigate("sticky");

      // Replace: re-add sticky route
      routesApi.replace([
        { name: "home", path: "/home" },
        { name: "sticky", path: "/sticky" },
      ]);

      // External deactivate guard preserved — cannot leave sticky
      await expect(router.navigate("home")).rejects.toThrowError();
    });
  });

  // ============================================================================
  // State preservation
  // ============================================================================

  describe("state preservation", () => {
    it("should preserve state if current route exists in new tree", async () => {
      await router.navigate("index");

      expect(router.getState()?.name).toBe("index");

      routesApi.replace([
        { name: "index", path: "/" },
        { name: "about", path: "/about" },
      ]);

      // State is preserved — index still exists in new tree
      expect(router.getState()?.name).toBe("index");
    });

    it("should update state.meta.params from new tree (not stale)", async () => {
      await router.navigate("index");
      const stateBefore = router.getState();

      expect(stateBefore?.name).toBe("index");
      expect(stateBefore?.path).toBe("/");

      // Replace with same route — state is revalidated via matchPath
      routesApi.replace([{ name: "index", path: "/" }]);

      const stateAfter = router.getState();

      expect(stateAfter?.name).toBe("index");
      expect(stateAfter?.path).toBe("/");
    });

    it("should clear state if current route removed from new tree", async () => {
      await router.navigate("index");

      expect(router.getState()?.name).toBe("index");

      // Replace without home
      routesApi.replace([{ name: "completely-new", path: "/completely-new" }]);

      // State is cleared — home no longer exists
      expect(router.getState()).toBeUndefined();
    });

    it("should not throw when state is undefined (router not started)", () => {
      const unstartedRouter = createTestRouter();
      const api = getRoutesApi(unstartedRouter);

      // No state exists — should not throw
      expect(() => {
        api.replace([{ name: "new", path: "/new" }]);
      }).not.toThrowError();

      expect(getPluginApi(unstartedRouter).matchPath("/new")?.name).toBe("new");
    });

    it("should clear state after replace([]) when router was navigated", async () => {
      await router.navigate("index");

      expect(router.getState()?.name).toBe("index");

      routesApi.replace([]);

      expect(router.getState()).toBeUndefined();
    });
  });

  // ============================================================================
  // Atomicity
  // ============================================================================

  describe("atomicity", () => {
    it("should block entire operation on validation error (tree unchanged)", () => {
      const beforeHas = routesApi.has("home");

      expect(() => {
        routesApi.replace([
          { name: "home", path: "/home" }, // valid
          { name: "invalid route name!", path: "/invalid" }, // invalid — has spaces
        ]);
      }).toThrowError();

      // Tree unchanged — home still exists
      expect(routesApi.has("home")).toBe(beforeHas);
    });

    it("should preserve external guards after replace([]) — unlike clear()", async () => {
      routesApi.add({ name: "ext-guarded", path: "/ext-guarded" });
      lifecycle.addActivateGuard("ext-guarded", () => () => false);

      // Replace with empty array
      routesApi.replace([]);

      // Re-add the route
      routesApi.add({ name: "ext-guarded", path: "/ext-guarded" });

      // External guard is still in place (replace preserves external guards, clear does not)
      await expect(router.navigate("ext-guarded")).rejects.toThrowError();
    });

    it("should block entire batch if duplicate route name is in new array", () => {
      const hadHome = routesApi.has("home");

      expect(() => {
        routesApi.replace([
          { name: "new-a", path: "/new-a" },
          { name: "new-a", path: "/new-a-dup" }, // duplicate name in batch
        ]);
      }).toThrowError();

      // Original tree intact
      expect(routesApi.has("home")).toBe(hadHome);
    });
  });

  // ============================================================================
  // Router lifecycle states
  // ============================================================================

  describe("router lifecycle states", () => {
    it("should work on unstarted router (no state)", () => {
      const unstartedRouter = createTestRouter();
      const api = getRoutesApi(unstartedRouter);

      expect(() => {
        api.replace([{ name: "fresh-route", path: "/fresh-route" }]);
      }).not.toThrowError();

      expect(api.has("fresh-route")).toBe(true);
    });

    it("should work on stopped router", async () => {
      await router.navigate("index");
      router.stop();

      expect(() => {
        routesApi.replace([{ name: "after-stop", path: "/after-stop" }]);
      }).not.toThrowError();

      expect(routesApi.has("after-stop")).toBe(true);
    });

    it("should throw RouterError(ROUTER_DISPOSED) after dispose", () => {
      router.dispose();

      expect(() => {
        routesApi.replace([{ name: "after-dispose", path: "/after-dispose" }]);
      }).toThrowError();
    });
  });

  // ============================================================================
  // Blocking during navigation
  // ============================================================================

  describe("blocking during navigation", () => {
    let errorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});
    });

    afterEach(() => {
      errorSpy.mockRestore();
    });

    it("should be a silent no-op during active navigation (logger.error, no exception)", async () => {
      let resolveCanActivate!: () => void;

      routesApi.add({
        name: "async-route",
        path: "/async-route",
        canActivate: () => () =>
          new Promise<boolean>((resolve) => {
            resolveCanActivate = () => {
              resolve(true);
            };
          }),
      });

      // Start navigation (will be held by the guard)
      const navigationPromise = router
        .navigate("async-route")
        .then(() => true)
        .catch(() => false);

      // Give time for navigation to start
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Replace during navigation — should be blocked (silent no-op)
      routesApi.replace([{ name: "replacement", path: "/replacement" }]);

      // Logger should have been called
      expect(errorSpy).toHaveBeenCalled();

      // Routes should be UNCHANGED (replace was blocked)
      expect(routesApi.has("home")).toBe(true);
      expect(routesApi.has("async-route")).toBe(true);
      expect(routesApi.has("replacement")).toBe(false);

      // Resolve guard to let navigation complete
      resolveCanActivate();
      await navigationPromise;
    });
  });

  // ============================================================================
  // noValidate mode
  // ============================================================================

  describe("noValidate mode", () => {
    it("should preserve external guards in noValidate mode", async () => {
      const nvRouter = createRouter([{ name: "home", path: "/home" }], {
        noValidate: true,
      });

      await nvRouter.start("/home");

      const nvRoutesApi = getRoutesApi(nvRouter);
      const nvLifecycle = getLifecycleApi(nvRouter);

      nvRoutesApi.add({ name: "guarded", path: "/guarded" });
      nvLifecycle.addActivateGuard("guarded", () => () => false);

      // Replace in noValidate mode — external guards should be preserved
      nvRoutesApi.replace([
        { name: "home", path: "/home" },
        { name: "guarded", path: "/guarded" },
      ]);

      // External guard is preserved even with noValidate
      await expect(nvRouter.navigate("guarded")).rejects.toThrowError();

      nvRouter.stop();
    });
  });

  // ============================================================================
  // Navigation after replace
  // ============================================================================

  describe("navigation after replace", () => {
    it("should allow navigation to new routes after replace", async () => {
      routesApi.replace([
        { name: "new-page", path: "/new-page" },
        { name: "another-page", path: "/another-page" },
      ]);

      await router.navigate("new-page");

      expect(router.getState()?.name).toBe("new-page");

      await router.navigate("another-page");

      expect(router.getState()?.name).toBe("another-page");
    });

    it("should reject navigation to removed routes with ROUTE_NOT_FOUND after replace", async () => {
      await router.navigate("index");

      // Replace removes all previous routes (index, home, etc.)
      routesApi.replace([{ name: "new-home", path: "/new-home" }]);

      // Navigation to removed route fails
      await expect(router.navigate("home")).rejects.toThrowError();
    });

    it("should build paths correctly for new routes after replace", () => {
      routesApi.replace([
        { name: "new-item", path: "/new-items/:id" },
        { name: "new-list", path: "/new-list" },
      ]);

      expect(router.buildPath("new-item", { id: "42" })).toBe("/new-items/42");
      expect(router.buildPath("new-list")).toBe("/new-list");
    });

    it("should support navigation with nested routes after replace", async () => {
      routesApi.replace([
        {
          name: "parent",
          path: "/parent",
          children: [{ name: "child", path: "/child" }],
        },
      ]);

      await router.navigate("parent.child");

      expect(router.getState()?.name).toBe("parent.child");
    });
  });

  // ============================================================================
  // Additional edge cases
  // ============================================================================

  describe("additional edge cases", () => {
    it("should support replace with nested route structures", () => {
      routesApi.replace([
        {
          name: "app",
          path: "/app",
          children: [
            { name: "dashboard", path: "/dashboard" },
            { name: "settings", path: "/settings" },
          ],
        },
      ]);

      expect(routesApi.has("app.dashboard")).toBe(true);
      expect(routesApi.has("app.settings")).toBe(true);
      expect(getPluginApi(router).matchPath("/app/dashboard")?.name).toBe(
        "app.dashboard",
      );
    });

    it("should support multiple replace calls (idempotent pattern)", () => {
      routesApi.replace([{ name: "v1-home", path: "/v1-home" }]);

      expect(routesApi.has("v1-home")).toBe(true);
      expect(routesApi.has("home")).toBe(false);

      routesApi.replace([{ name: "v2-home", path: "/v2-home" }]);

      expect(routesApi.has("v2-home")).toBe(true);
      expect(routesApi.has("v1-home")).toBe(false);
    });

    it("should allow add() after replace", () => {
      routesApi.replace([{ name: "base", path: "/base" }]);

      routesApi.add({ name: "extra", path: "/extra" });

      expect(routesApi.has("base")).toBe(true);
      expect(routesApi.has("extra")).toBe(true);
    });
  });
});
