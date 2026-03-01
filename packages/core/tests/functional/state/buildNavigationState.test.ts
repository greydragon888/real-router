import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { events, getPluginApi, getRoutesApi } from "@real-router/core";

import { createTestRouter } from "../../helpers";

import type { PluginApi, Router, RoutesApi } from "@real-router/core";

let router: Router;
let routesApi: RoutesApi;
let api: PluginApi;

describe("getPluginApi().buildNavigationState()", () => {
  beforeEach(async () => {
    router = createTestRouter();
    routesApi = getRoutesApi(router);
    api = getPluginApi(router);
    await router.start("/home");
  });

  afterEach(() => {
    router.stop();
  });

  describe("happy path", () => {
    it("should return State for existing route with no params", () => {
      const state = api.buildNavigationState("home");

      expect(state).toBeDefined();
      expect(state?.name).toBe("home");
      expect(state?.params).toStrictEqual({});
    });

    it("should return State for existing route with params", () => {
      const state = api.buildNavigationState("items", { id: "123" });

      expect(state).toBeDefined();
      expect(state?.name).toBe("items");
      expect(state?.params).toStrictEqual({ id: "123" });
    });

    it("should return State with correct path", () => {
      const state = api.buildNavigationState("items", { id: "456" });

      expect(state).toBeDefined();
      expect(state?.path).toBe("/items/456");
    });

    it("should return State with correct meta", () => {
      const state = api.buildNavigationState("home");

      expect(state).toBeDefined();
      expect(state?.meta).toBeDefined();
      expect(state?.meta?.id).toBeGreaterThanOrEqual(0);
      expect(state?.meta?.params).toBeDefined();
    });

    it("should return frozen State (immutable)", () => {
      const state = api.buildNavigationState("home");

      expect(state).toBeDefined();
      expect(Object.isFrozen(state)).toBe(true);
      expect(Object.isFrozen(state?.params)).toBe(true);
      expect(Object.isFrozen(state?.meta)).toBe(true);
    });
  });

  describe("route not found", () => {
    it("should return undefined for non-existent route", () => {
      const state = api.buildNavigationState("nonexistent");

      expect(state).toBeUndefined();
    });

    it("should return undefined (not null) for non-existent route", () => {
      const state = api.buildNavigationState("nonexistent.route");

      expect(state).toBeUndefined();
      expect(state).not.toBeNull();
    });
  });

  describe("route forwarding (plugin interception)", () => {
    it("should resolve forwarded routes (forwardTo)", () => {
      routesApi.add({
        name: "old-route",
        path: "/old",
        forwardTo: "home",
      });

      const state = api.buildNavigationState("old-route");

      expect(state).toBeDefined();
      expect(state?.name).toBe("home");
      expect(state?.path).toBe("/home");
    });

    it("should apply default params from route definition", () => {
      routesApi.add({
        name: "with-defaults",
        path: "/defaults/:id",
        defaultParams: { id: "default-id" },
      });

      const state = api.buildNavigationState("with-defaults");

      expect(state).toBeDefined();
      expect(state?.params).toStrictEqual({ id: "default-id" });
    });
  });

  describe("params defaulting", () => {
    it("should use empty object when params not provided", () => {
      const state = api.buildNavigationState("home");

      expect(state).toBeDefined();
      expect(state?.params).toStrictEqual({});
    });
  });

  describe("argument validation", () => {
    it("should throw TypeError for non-string routeName", () => {
      expect(() =>
        api.buildNavigationState(123 as unknown as string),
      ).toThrowError(TypeError);
    });

    it("should throw TypeError for null routeName", () => {
      expect(() =>
        api.buildNavigationState(null as unknown as string),
      ).toThrowError(TypeError);
      expect(() =>
        api.buildNavigationState(null as unknown as string),
      ).toThrowError(/Invalid routeName/);
    });

    it("should return undefined for empty string routeName", () => {
      const state = api.buildNavigationState("");

      expect(state).toBeUndefined();
    });

    it("should throw TypeError for invalid routeParams (string)", () => {
      expect(() =>
        api.buildNavigationState("home", "invalid" as never),
      ).toThrowError(TypeError);
      expect(() =>
        api.buildNavigationState("home", "invalid" as never),
      ).toThrowError(/Invalid routeParams/);
    });

    it("should throw TypeError for invalid routeParams (function)", () => {
      expect(() =>
        api.buildNavigationState("home", (() => {}) as never),
      ).toThrowError(TypeError);
      expect(() =>
        api.buildNavigationState("home", (() => {}) as never),
      ).toThrowError(/Invalid routeParams/);
    });

    it("should include 'buildNavigationState' in error message", () => {
      expect(() =>
        api.buildNavigationState(123 as unknown as string),
      ).toThrowError(/buildNavigationState/);
    });
  });

  describe("no side effects (pure function)", () => {
    it("should not change router state", async () => {
      await router.navigate("users", {});

      const stateBefore = router.getState();

      api.buildNavigationState("orders");

      const stateAfter = router.getState();

      expect(stateAfter).toBe(stateBefore);
    });

    it("should not emit any transition events", () => {
      const onStart = vi.fn();
      const onSuccess = vi.fn();
      const onError = vi.fn();

      const unsub1 = api.addEventListener(events.TRANSITION_START, onStart);
      const unsub2 = api.addEventListener(events.TRANSITION_SUCCESS, onSuccess);
      const unsub3 = api.addEventListener(events.TRANSITION_ERROR, onError);

      api.buildNavigationState("home");
      api.buildNavigationState("nonexistent");

      expect(onStart).not.toHaveBeenCalled();
      expect(onSuccess).not.toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();

      unsub1();
      unsub2();
      unsub3();
    });
  });

  describe("stopped router", () => {
    it("should work when router is not started", () => {
      const stoppedRouter = createTestRouter();
      const stoppedApi = getPluginApi(stoppedRouter);

      const state = stoppedApi.buildNavigationState("home");

      expect(state).toBeDefined();
      expect(state?.name).toBe("home");
    });
  });

  describe("noValidate mode", () => {
    it("should skip validation and return undefined for invalid input", async () => {
      const noValidateRouter = createTestRouter({ noValidate: true });

      await noValidateRouter.start("/home");

      const noValidateApi = getPluginApi(noValidateRouter);
      const result = noValidateApi.buildNavigationState(
        123 as unknown as string,
      );

      expect(result).toBeUndefined();

      noValidateRouter.stop();
    });
  });
});
