import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { createRouter } from "@real-router/core";

import { createTestRouter } from "../../../helpers";

import type { Router } from "@real-router/core";

let router: Router;

describe("core/routes/routeTree/getRouteConfig", () => {
  beforeEach(async () => {
    router = createTestRouter();
    await router.start("/home");
  });

  afterEach(() => {
    router.stop();
  });

  describe("returns custom fields", () => {
    it("should return custom fields for route with custom data", () => {
      router.addRoute({
        name: "gc-home",
        path: "/gc-home",
        title: "Home",
        abortRequest: [{ url: "api/**" }],
      } as never);

      expect(router.getRouteConfig("gc-home")).toStrictEqual({
        title: "Home",
        abortRequest: [{ url: "api/**" }],
      });
    });

    it("should return undefined for non-existent route", () => {
      expect(router.getRouteConfig("nonexistent")).toBeUndefined();
    });

    it("should return undefined for route with only standard fields", () => {
      router.addRoute({ name: "gc-basic", path: "/gc-basic" });

      expect(router.getRouteConfig("gc-basic")).toBeUndefined();
    });
  });

  describe("with nested routes", () => {
    it("should work with nested routes (dot-notation names)", () => {
      router.addRoute({
        name: "gc-users",
        path: "/gc-users",
        children: [
          { name: "profile", path: "/:id", title: "Profile" } as never,
        ],
      } as never);

      expect(router.getRouteConfig("gc-users.profile")).toStrictEqual({
        title: "Profile",
      });
    });
  });

  describe("lifecycle integration", () => {
    it("should work with routes added dynamically via addRoute()", () => {
      router.addRoute({
        name: "gc-dynamic",
        path: "/gc-dynamic",
        customField: "value",
      } as never);

      expect(router.getRouteConfig("gc-dynamic")).toStrictEqual({
        customField: "value",
      });
    });

    it("should return undefined after removeRoute()", () => {
      router.addRoute({
        name: "gc-remove",
        path: "/gc-remove",
        title: "Remove Me",
      } as never);

      expect(router.getRouteConfig("gc-remove")).toStrictEqual({
        title: "Remove Me",
      });

      router.removeRoute("gc-remove");

      expect(router.getRouteConfig("gc-remove")).toBeUndefined();
    });

    it("should return undefined after clearRoutes()", () => {
      router.addRoute({
        name: "gc-clear",
        path: "/gc-clear",
        title: "Clear Me",
      } as never);

      expect(router.getRouteConfig("gc-clear")).toStrictEqual({
        title: "Clear Me",
      });

      router.clearRoutes();

      expect(router.getRouteConfig("gc-clear")).toBeUndefined();
    });

    it("should preserve custom fields in cloned router", () => {
      router.addRoute({
        name: "gc-clonable",
        path: "/gc-clonable",
        title: "Clonable",
      } as never);

      const clone = router.clone();

      expect(clone.getRouteConfig("gc-clonable")).toStrictEqual({
        title: "Clonable",
      });
    });

    it("should preserve custom fields after updateRoute()", () => {
      router.addRoute({
        name: "gc-update",
        path: "/gc-update",
        title: "Update Me",
      } as never);

      router.updateRoute("gc-update", { defaultParams: { lang: "en" } });

      expect(router.getRouteConfig("gc-update")).toStrictEqual({
        title: "Update Me",
      });
    });
  });

  describe("middleware integration", () => {
    it("should allow middleware to access route config during post-commit execution", async () => {
      const capturedConfig: unknown[] = [];

      const middlewareRouter = createRouter([
        { name: "gc-mw-home", path: "/", title: "Home" } as never,
      ]);

      middlewareRouter.useMiddleware(() => (toState) => {
        capturedConfig.push(middlewareRouter.getRouteConfig(toState.name));
      });

      await middlewareRouter.start("/");

      expect(capturedConfig[0]).toStrictEqual({ title: "Home" });

      middlewareRouter.stop();
    });
  });

  describe("after dispose", () => {
    it("should return undefined after dispose (routes are cleared)", () => {
      router.addRoute({
        name: "gc-dispose",
        path: "/gc-dispose",
        title: "Dispose Me",
      } as never);

      expect(router.getRouteConfig("gc-dispose")).toStrictEqual({
        title: "Dispose Me",
      });

      router.dispose();

      expect(router.getRouteConfig("gc-dispose")).toBeUndefined();

      router = createTestRouter();
      router.stop();
    });
  });

  describe("initial routes with custom fields", () => {
    it("should return custom fields from routes provided at router creation", () => {
      const freshRouter = createRouter([
        {
          name: "gc-init-home",
          path: "/",
          title: "Home",
          abortRequest: [{ url: "api/**" }],
        } as never,
      ]);

      expect(freshRouter.getRouteConfig("gc-init-home")).toStrictEqual({
        title: "Home",
        abortRequest: [{ url: "api/**" }],
      });
    });
  });
});
