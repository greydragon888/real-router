import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { createRouter } from "@real-router/core";
import { cloneRouter, getPluginApi, getRoutesApi } from "@real-router/core/api";

import { createTestRouter } from "../../../helpers";

import type { Router } from "@real-router/core";
import type { PluginApi, RoutesApi } from "@real-router/core/api";

let router: Router;
let routesApi: RoutesApi;
let pluginApi: PluginApi;

describe("core/routes/routeTree/getRouteConfig", () => {
  beforeEach(async () => {
    router = createTestRouter();
    routesApi = getRoutesApi(router);
    pluginApi = getPluginApi(router);
    await router.start("/home");
  });

  afterEach(() => {
    router.stop();
  });

  describe("returns custom fields", () => {
    it("should return custom fields for route with custom data", () => {
      routesApi.add({
        name: "gc-home",
        path: "/gc-home",
        title: "Home",
        abortRequest: [{ url: "api/**" }],
      } as never);

      expect(pluginApi.getRouteConfig("gc-home")).toStrictEqual({
        title: "Home",
        abortRequest: [{ url: "api/**" }],
      });
    });

    it("should return undefined for non-existent route", () => {
      expect(pluginApi.getRouteConfig("nonexistent")).toBeUndefined();
    });

    it("should return undefined for route with only standard fields", () => {
      routesApi.add({ name: "gc-basic", path: "/gc-basic" });

      expect(pluginApi.getRouteConfig("gc-basic")).toBeUndefined();
    });
  });

  describe("with nested routes", () => {
    it("should work with nested routes (dot-notation names)", () => {
      routesApi.add({
        name: "gc-users",
        path: "/gc-users",
        children: [
          { name: "profile", path: "/:id", title: "Profile" } as never,
        ],
      } as never);

      expect(pluginApi.getRouteConfig("gc-users.profile")).toStrictEqual({
        title: "Profile",
      });
    });
  });

  describe("lifecycle integration", () => {
    it("should work with routes added dynamically via addRoute()", () => {
      routesApi.add({
        name: "gc-dynamic",
        path: "/gc-dynamic",
        customField: "value",
      } as never);

      expect(pluginApi.getRouteConfig("gc-dynamic")).toStrictEqual({
        customField: "value",
      });
    });

    it("should return undefined after removeRoute()", () => {
      routesApi.add({
        name: "gc-remove",
        path: "/gc-remove",
        title: "Remove Me",
      } as never);

      expect(pluginApi.getRouteConfig("gc-remove")).toStrictEqual({
        title: "Remove Me",
      });

      routesApi.remove("gc-remove");

      expect(pluginApi.getRouteConfig("gc-remove")).toBeUndefined();
    });

    it("should return undefined after clearRoutes()", () => {
      routesApi.add({
        name: "gc-clear",
        path: "/gc-clear",
        title: "Clear Me",
      } as never);

      expect(pluginApi.getRouteConfig("gc-clear")).toStrictEqual({
        title: "Clear Me",
      });

      routesApi.clear();

      expect(pluginApi.getRouteConfig("gc-clear")).toBeUndefined();
    });

    it("should preserve custom fields in cloned router", () => {
      routesApi.add({
        name: "gc-clonable",
        path: "/gc-clonable",
        title: "Clonable",
      } as never);

      const clone = cloneRouter(router);
      const clonePluginApi = getPluginApi(clone);

      expect(clonePluginApi.getRouteConfig("gc-clonable")).toStrictEqual({
        title: "Clonable",
      });
    });

    it("should preserve custom fields after updateRoute()", () => {
      routesApi.add({
        name: "gc-update",
        path: "/gc-update",
        title: "Update Me",
      } as never);

      routesApi.update("gc-update", { defaultParams: { lang: "en" } });

      expect(pluginApi.getRouteConfig("gc-update")).toStrictEqual({
        title: "Update Me",
      });
    });
  });

  describe("plugin integration", () => {
    it("should allow plugin to access route config during post-commit execution", async () => {
      const capturedConfig: unknown[] = [];

      const middlewareRouter = createRouter([
        { name: "gc-mw-home", path: "/", title: "Home" } as never,
      ]);
      const middlewarePluginApi = getPluginApi(middlewareRouter);

      middlewareRouter.usePlugin(() => ({
        onTransitionSuccess: (toState) => {
          capturedConfig.push(middlewarePluginApi.getRouteConfig(toState.name));
        },
      }));

      await middlewareRouter.start("/");

      expect(capturedConfig[0]).toStrictEqual({ title: "Home" });

      middlewareRouter.stop();
    });
  });

  describe("after dispose", () => {
    it("should return undefined after dispose (routes are cleared)", () => {
      routesApi.add({
        name: "gc-dispose",
        path: "/gc-dispose",
        title: "Dispose Me",
      } as never);

      expect(pluginApi.getRouteConfig("gc-dispose")).toStrictEqual({
        title: "Dispose Me",
      });

      router.dispose();

      expect(pluginApi.getRouteConfig("gc-dispose")).toBeUndefined();

      router = createTestRouter();
      routesApi = getRoutesApi(router);
      pluginApi = getPluginApi(router);
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
      const freshPluginApi = getPluginApi(freshRouter);

      expect(freshPluginApi.getRouteConfig("gc-init-home")).toStrictEqual({
        title: "Home",
        abortRequest: [{ url: "api/**" }],
      });
    });
  });
});
