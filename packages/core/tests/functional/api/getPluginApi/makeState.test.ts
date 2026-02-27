import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getPluginApi, getRoutesApi } from "../../../../src";
import { createTestRouter } from "../../../helpers";

import type { RoutesApi } from "../../../../src";
import type { Router } from "@real-router/types";

let router: Router;
let routesApi: RoutesApi;

describe("makeState", () => {
  beforeEach(async () => {
    router = createTestRouter();
    routesApi = getRoutesApi(router);
    await router.start("/home");
  });

  afterEach(() => {
    router.stop();
  });

  it("returns valid state object", () => {
    const state = getPluginApi(router).makeState(
      "home",
      { foo: "bar" },
      "/home",
    );

    expect(state).toMatchObject({
      name: "home",
      path: "/home",
      params: { foo: "bar" },
    });
    expect(state.meta).toBe(undefined);
  });

  it("merges with defaultParams", () => {
    // Add a route with defaultParams
    routesApi.add({
      name: "withDefaults",
      path: "/with-defaults",
      defaultParams: { lang: "en" },
    });
    const state = getPluginApi(router).makeState(
      "withDefaults",
      { id: 123 },
      "/with-defaults",
    );

    expect(state.params).toStrictEqual({ lang: "en", id: 123 });
  });

  it("uses empty params when no params and no defaultParams (line 328)", () => {
    // home route has no defaultParams defined
    // Call makeState with undefined params (no params, no defaults)
    const state = getPluginApi(router).makeState(
      "home",
      undefined as never,
      "/home",
    );

    expect(state.params).toStrictEqual({});
  });

  it("uses forced ID if provided", () => {
    const state = getPluginApi(router).makeState(
      "home",
      {},
      "/home",
      { params: {}, options: {} },
      999,
    );

    expect(state.meta?.id).toBe(999);
  });

  describe("argument validation", () => {
    it("throws TypeError for non-string name", () => {
      expect(() =>
        getPluginApi(router).makeState(123 as unknown as string, {}),
      ).toThrowError(TypeError);
      expect(() =>
        getPluginApi(router).makeState(null as unknown as string, {}),
      ).toThrowError(/Invalid name/);
    });

    it("throws TypeError for invalid params", () => {
      expect(() =>
        getPluginApi(router).makeState("home", "invalid" as never),
      ).toThrowError(TypeError);
      expect(() =>
        getPluginApi(router).makeState("home", (() => {}) as never),
      ).toThrowError(/Invalid params/);
    });

    it("throws TypeError for non-string path", () => {
      expect(() =>
        getPluginApi(router).makeState("home", {}, 123 as unknown as string),
      ).toThrowError(TypeError);
      expect(() =>
        getPluginApi(router).makeState("home", {}, {} as unknown as string),
      ).toThrowError(/Invalid path/);
    });

    it("throws TypeError for non-number forceId", () => {
      expect(() =>
        getPluginApi(router).makeState(
          "home",
          {},
          "/home",
          { params: {}, options: {} },
          "999" as unknown as number,
        ),
      ).toThrowError(TypeError);
      expect(() =>
        getPluginApi(router).makeState(
          "home",
          {},
          "/home",
          { params: {}, options: {} },
          {} as unknown as number,
        ),
      ).toThrowError(/Invalid forceId/);
    });
  });
});
