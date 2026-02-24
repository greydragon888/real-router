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
  });

  it("should return a new object on each call", () => {
    const routesApi2 = getRoutesApi(router);

    expect(routesApi).not.toBe(routesApi2);
  });

  it("has should check if route exists", () => {
    expect(routesApi.has("home")).toBe(true);
    expect(routesApi.has("nonexistent")).toBe(false);
  });

  it("add should add a route", () => {
    routesApi.add({ name: "newRoute", path: "/new" });

    expect(router.hasRoute("newRoute")).toBe(true);
  });

  it("remove should remove a route", () => {
    routesApi.add({ name: "temp", path: "/temp" });
    routesApi.remove("temp");

    expect(router.hasRoute("temp")).toBe(false);
  });

  it("update should update a route", () => {
    routesApi.update("home", { defaultParams: { page: "1" } });

    expect(router.hasRoute("home")).toBe(true);
  });

  it("clear should clear all routes", () => {
    routesApi.clear();

    expect(router.hasRoute("home")).toBe(false);
  });
});
