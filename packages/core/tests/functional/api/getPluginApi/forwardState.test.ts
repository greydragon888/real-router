import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { getPluginApi, getRoutesApi } from "@real-router/core";

import { createTestRouter } from "../../../helpers";

import type { Router, RoutesApi } from "@real-router/core";

let router: Router;
let routesApi: RoutesApi;

describe("forwardState", () => {
  beforeEach(async () => {
    router = createTestRouter();
    routesApi = getRoutesApi(router);
    await router.start("/home");
  });

  afterEach(() => {
    router.stop();
  });

  it("returns same state if no forward defined", () => {
    const state = getPluginApi(router).forwardState("home", { id: 1 });

    expect(state.name).toBe("home");
    expect(state.params.id).toBe(1);
  });

  it("forwards to another route with merged params", () => {
    // Add routes with defaultParams
    routesApi.add([
      { name: "srcRoute", path: "/src", defaultParams: { a: 1 } },
      { name: "dstRoute", path: "/dst", defaultParams: { b: 2 } },
    ]);
    routesApi.update("srcRoute", { forwardTo: "dstRoute" });

    const state = getPluginApi(router).forwardState("srcRoute", { c: 3 });

    expect(state.name).toBe("dstRoute");
    expect(state.params).toStrictEqual({ a: 1, b: 2, c: 3 });
  });

  it("forwards with only source route defaults (line 595)", () => {
    // Add routes: source has defaults, target doesn't
    routesApi.add([
      {
        name: "srcWithDefaults",
        path: "/src-with-defaults",
        defaultParams: { a: 1 },
      },
      { name: "dstNoDefaults", path: "/dst-no-defaults" },
    ]);
    routesApi.update("srcWithDefaults", {
      forwardTo: "dstNoDefaults",
    });

    const state = getPluginApi(router).forwardState("srcWithDefaults", {
      c: 3,
    });

    expect(state.name).toBe("dstNoDefaults");
    expect(state.params).toStrictEqual({ a: 1, c: 3 });
  });

  it("forwards with only target route defaults (line 598)", () => {
    // Add routes: source has no defaults, target has defaults
    routesApi.add([
      { name: "srcNoDefaults", path: "/src-no-defaults" },
      {
        name: "dstWithDefaults",
        path: "/dst-with-defaults",
        defaultParams: { b: 2 },
      },
    ]);
    routesApi.update("srcNoDefaults", {
      forwardTo: "dstWithDefaults",
    });

    const state = getPluginApi(router).forwardState("srcNoDefaults", {
      c: 3,
    });

    expect(state.name).toBe("dstWithDefaults");
    expect(state.params).toStrictEqual({ b: 2, c: 3 });
  });

  describe("argument validation", () => {
    it("throws TypeError for non-string routeName", () => {
      expect(() =>
        getPluginApi(router).forwardState(123 as unknown as string, {}),
      ).toThrowError(TypeError);
      expect(() =>
        getPluginApi(router).forwardState(null as unknown as string, {}),
      ).toThrowError(/Invalid routeName/);
    });

    it("throws TypeError for invalid routeParams", () => {
      expect(() =>
        getPluginApi(router).forwardState("home", "invalid" as never),
      ).toThrowError(TypeError);
      expect(() =>
        getPluginApi(router).forwardState("home", (() => {}) as never),
      ).toThrowError(/Invalid routeParams/);
    });
  });
});
