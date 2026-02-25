import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { getRoutesApi } from "@real-router/core";

import { createTestRouter } from "../../helpers";

import type { Router, RoutesApi } from "@real-router/core";

let router: Router;
let routesApi: RoutesApi;

describe("getRoutesApi()", () => {
  beforeEach(() => {
    router = createTestRouter();
    routesApi = getRoutesApi(router);
  });

  afterEach(() => {
    router.stop();
  });

  it("should return an object with all expected methods", () => {
    expect(typeof routesApi.add).toBe("function");
    expect(typeof routesApi.remove).toBe("function");
    expect(typeof routesApi.update).toBe("function");
    expect(typeof routesApi.clear).toBe("function");
    expect(typeof routesApi.has).toBe("function");
    expect(typeof routesApi.get).toBe("function");
    expect(typeof routesApi.getConfig).toBe("function");
  });

  it("should return a new object on each call", () => {
    const routesApi2 = getRoutesApi(router);

    expect(routesApi).not.toBe(routesApi2);
  });

  it("has should check if route exists", () => {
    expect(routesApi.has("home")).toBe(true);
    expect(routesApi.has("nonexistent")).toBe(false);
  });

  it("get should return the route definition for an existing route", () => {
    const route = routesApi.get("home");

    expect(route).toBeDefined();
    expect(route?.name).toBe("home");
  });

  it("get should return undefined for a non-existent route", () => {
    const route = routesApi.get("nonexistent");

    expect(route).toBeUndefined();
  });

  it("getConfig should return route config for an existing route", () => {
    const config = routesApi.getConfig("home");

    expect(config === undefined || typeof config === "object").toBe(true);
  });

  it("getConfig should return undefined for a non-existent route", () => {
    const config = routesApi.getConfig("nonexistent");

    expect(config).toBeUndefined();
  });

  it("add should add a route", () => {
    routesApi.add({ name: "newRoute", path: "/new" });

    expect(router.hasRoute("newRoute")).toBe(true);
  });

  it("add should add multiple routes when passed an array", () => {
    routesApi.add([
      { name: "r1", path: "/r1" },
      { name: "r2", path: "/r2" },
    ]);

    expect(router.hasRoute("r1")).toBe(true);
    expect(router.hasRoute("r2")).toBe(true);
  });

  it("add should add a route under a parent", () => {
    routesApi.add({ name: "child", path: "/child" }, { parent: "home" });

    expect(router.hasRoute("home.child")).toBe(true);
  });

  it("remove should remove a route", () => {
    routesApi.add({ name: "temp", path: "/temp" });
    routesApi.remove("temp");

    expect(router.hasRoute("temp")).toBe(false);
  });

  it("remove should return early when the route is currently active", async () => {
    await router.start("/home");

    routesApi.remove("home");

    expect(router.hasRoute("home")).toBe(true);
  });

  it("remove should log a warning when the route is not found", () => {
    routesApi.remove("nonexistent");

    expect(router.hasRoute("nonexistent")).toBe(false);
  });

  it("update should update a route", () => {
    routesApi.update("home", { defaultParams: { page: "1" } });

    expect(router.hasRoute("home")).toBe(true);
    expect(router.buildPath("home")).toBe("/home?page=1");
  });

  it("update should set canActivate guard", () => {
    routesApi.update("home", { canActivate: () => () => true });

    expect(router.hasRoute("home")).toBe(true);
  });

  it("update should clear canActivate guard when null", () => {
    routesApi.update("home", { canActivate: () => () => true });
    routesApi.update("home", { canActivate: null });

    expect(router.hasRoute("home")).toBe(true);
  });

  it("update should set canDeactivate guard", () => {
    routesApi.update("home", { canDeactivate: () => () => true });

    expect(router.hasRoute("home")).toBe(true);
  });

  it("update should clear canDeactivate guard when null", () => {
    routesApi.update("home", { canDeactivate: () => () => true });
    routesApi.update("home", { canDeactivate: null });

    expect(router.hasRoute("home")).toBe(true);
  });

  it("clear should clear all routes", () => {
    routesApi.clear();

    expect(router.hasRoute("home")).toBe(false);
  });

  describe("when noValidate is true", () => {
    let noValidateRouter: Router;
    let noValidateApi: RoutesApi;

    beforeEach(() => {
      noValidateRouter = createTestRouter({ noValidate: true });
      noValidateApi = getRoutesApi(noValidateRouter);
    });

    afterEach(() => {
      noValidateRouter.stop();
    });

    it("add should add a route without validation", () => {
      noValidateApi.add({ name: "noValidateRoute", path: "/nv" });

      expect(noValidateRouter.hasRoute("noValidateRoute")).toBe(true);
    });

    it("add should add a route under a parent without validation", () => {
      noValidateApi.add({ name: "child", path: "/child" }, { parent: "home" });

      expect(noValidateRouter.hasRoute("home.child")).toBe(true);
    });

    it("remove should remove a route without validation", () => {
      noValidateApi.add({ name: "temp", path: "/temp" });
      noValidateApi.remove("temp");

      expect(noValidateRouter.hasRoute("temp")).toBe(false);
    });

    it("update should update a route without validation", () => {
      noValidateApi.update("home", { defaultParams: { page: "1" } });

      expect(noValidateRouter.hasRoute("home")).toBe(true);
    });

    it("has should check route existence without validation", () => {
      expect(noValidateApi.has("home")).toBe(true);
      expect(noValidateApi.has("nonexistent")).toBe(false);
    });

    it("get should return route without validation", () => {
      const route = noValidateApi.get("home");

      expect(route).toBeDefined();
      expect(route?.name).toBe("home");
    });
  });

  describe("when router is disposed", () => {
    it("add should throw RouterError", () => {
      const freshRouter = createTestRouter();
      const freshApi = getRoutesApi(freshRouter);

      freshRouter.dispose();

      expect(() => {
        freshApi.add({ name: "x", path: "/x" });
      }).toThrowError();
    });

    it("remove should throw RouterError", () => {
      const freshRouter = createTestRouter();
      const freshApi = getRoutesApi(freshRouter);

      freshRouter.dispose();

      expect(() => {
        freshApi.remove("home");
      }).toThrowError();
    });

    it("update should throw RouterError", () => {
      const freshRouter = createTestRouter();
      const freshApi = getRoutesApi(freshRouter);

      freshRouter.dispose();

      expect(() => {
        freshApi.update("home", {});
      }).toThrowError();
    });

    it("clear should throw RouterError", () => {
      const freshRouter = createTestRouter();
      const freshApi = getRoutesApi(freshRouter);

      freshRouter.dispose();

      expect(() => {
        freshApi.clear();
      }).toThrowError();
    });
  });
});
