import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { RouterError } from "@real-router/core";

import { getPluginApi } from "../../../../src/api";
import { createTestRouter } from "../../../helpers";

import type { PluginApi } from "../../../../src/api";
import type { Router } from "@real-router/core";

let router: Router;
let api: PluginApi;

describe("addInterceptor('buildPath')", () => {
  beforeEach(async () => {
    router = createTestRouter();
    api = getPluginApi(router);
    await router.start("/home");
  });

  afterEach(() => {
    if (router.isActive()) {
      router.stop();
    }
  });

  it("transforms params in facade buildPath() calls", () => {
    api.addInterceptor("buildPath", (next, route, params) =>
      next(route, { ...params, id: "intercepted-42" }),
    );

    const path = router.buildPath("users.view", { id: "original" });

    expect(path).toBe("/users/view/intercepted-42");
  });

  it("transforms params in buildPath() inside navigate() — state.path reflects intercepted params", async () => {
    api.addInterceptor("buildPath", (next, route, params) =>
      next(route, { ...params, id: "intercepted-99" }),
    );

    const state = await router.navigate("users.view", { id: "original" });

    expect(state.path).toBe("/users/view/intercepted-99");
  });

  describe("pipeline composition", () => {
    it("two interceptors compose — last-added is outermost", () => {
      api.addInterceptor("buildPath", (next, route, params) =>
        next(route, { ...params, id: `first-${params?.id as string}` }),
      );

      api.addInterceptor("buildPath", (next, route, params) =>
        next(route, { ...params, id: `second-${params?.id as string}` }),
      );

      const path = router.buildPath("users.view", { id: "0" });

      expect(path).toBe("/users/view/first-second-0");
    });
  });

  describe("unsubscribe", () => {
    it("correctly removes interceptor from pipeline", () => {
      const unsub = api.addInterceptor("buildPath", (next, route, params) =>
        next(route, { ...params, id: "intercepted" }),
      );

      unsub();

      const path = router.buildPath("users.view", { id: "original" });

      expect(path).toBe("/users/view/original");
    });

    it("interceptor is NOT called after unsubscribe", () => {
      let callCount = 0;

      const unsub = api.addInterceptor("buildPath", (next, route, params) => {
        callCount++;

        return next(route, params);
      });

      router.buildPath("home");

      expect(callCount).toBe(1);

      unsub();

      router.buildPath("home");

      expect(callCount).toBe(1);
    });

    it("double unsubscribe is a no-op", () => {
      const unsub = api.addInterceptor("buildPath", (next, route, params) =>
        next(route, { ...params, id: "intercepted" }),
      );

      unsub();
      unsub();

      const path = router.buildPath("users.view", { id: "original" });

      expect(path).toBe("/users/view/original");
    });
  });

  describe("empty pipeline", () => {
    it("buildPath works as before with no interceptors (no regression)", () => {
      const path = router.buildPath("users.view", { id: "42" });

      expect(path).toBe("/users/view/42");
    });
  });

  describe("disposed router", () => {
    it("throws ROUTER_DISPOSED on disposed router", () => {
      router.dispose();

      const disposedApi = getPluginApi(router);

      expect(() => {
        disposedApi.addInterceptor("buildPath", (next, route, params) =>
          next(route, params),
        );
      }).toThrowError(RouterError);
    });
  });
});
