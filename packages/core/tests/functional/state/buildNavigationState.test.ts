import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { createTestRouter } from "../../helpers";

import type { Router } from "@real-router/core";

let router: Router;

describe("router.buildNavigationState()", () => {
  beforeEach(() => {
    router = createTestRouter();
    router.start();
  });

  afterEach(() => {
    router.stop();
  });

  describe("happy path", () => {
    it("should return State for existing route with no params", () => {
      const state = router.buildNavigationState("home");

      expect(state).not.toBeNull();
      expect(state?.name).toBe("home");
      expect(state?.params).toStrictEqual({});
    });

    it("should return State for existing route with params", () => {
      const state = router.buildNavigationState("items", { id: "123" });

      expect(state).not.toBeNull();
      expect(state?.name).toBe("items");
      expect(state?.params).toStrictEqual({ id: "123" });
    });

    it("should return State with correct path", () => {
      const state = router.buildNavigationState("items", { id: "456" });

      expect(state).not.toBeNull();
      expect(state?.path).toBe("/items/456");
    });

    it("should return State with correct meta", () => {
      const state = router.buildNavigationState("home");

      expect(state).not.toBeNull();
      expect(state?.meta).toBeDefined();
      expect(state?.meta?.id).toBeGreaterThanOrEqual(0);
      expect(state?.meta?.params).toBeDefined();
    });

    it("should return frozen State (immutable)", () => {
      const state = router.buildNavigationState("home");

      expect(state).not.toBeNull();
      expect(Object.isFrozen(state)).toBe(true);
      expect(Object.isFrozen(state?.params)).toBe(true);
      expect(Object.isFrozen(state?.meta)).toBe(true);
    });

    it("should return State with meta.options as empty object", () => {
      const state = router.buildNavigationState("home");

      expect(state).not.toBeNull();
      expect(state?.meta?.options).toStrictEqual({});
    });

    it("should return State with meta.redirected as false", () => {
      const state = router.buildNavigationState("home");

      expect(state).not.toBeNull();
      expect(state?.meta?.redirected).toBe(false);
    });
  });

  describe("route not found", () => {
    it("should return null for non-existent route", () => {
      const state = router.buildNavigationState("nonexistent");

      expect(state).toBeNull();
    });

    it("should return null (not undefined) for non-existent route", () => {
      const state = router.buildNavigationState("nonexistent.route");

      expect(state).toBeNull();
      expect(state).not.toBeUndefined();
    });
  });

  describe("route forwarding (plugin interception)", () => {
    it("should resolve forwarded routes (forwardTo)", () => {
      router.addRoute({
        name: "old-route",
        path: "/old",
        forwardTo: "home",
      });

      const state = router.buildNavigationState("old-route");

      expect(state).not.toBeNull();
      expect(state?.name).toBe("home");
      expect(state?.path).toBe("/home");
    });

    it("should apply default params from route definition", () => {
      router.addRoute({
        name: "with-defaults",
        path: "/defaults/:id",
        defaultParams: { id: "default-id" },
      });

      const state = router.buildNavigationState("with-defaults");

      expect(state).not.toBeNull();
      expect(state?.params).toStrictEqual({ id: "default-id" });
    });
  });

  describe("params defaulting", () => {
    it("should use empty object when params not provided", () => {
      const state = router.buildNavigationState("home");

      expect(state).not.toBeNull();
      expect(state?.params).toStrictEqual({});
    });
  });

  describe("argument validation", () => {
    it("should throw TypeError for non-string routeName", () => {
      expect(() =>
        router.buildNavigationState(123 as unknown as string),
      ).toThrowError(TypeError);
    });

    it("should throw TypeError for null routeName", () => {
      expect(() =>
        router.buildNavigationState(null as unknown as string),
      ).toThrowError(TypeError);
      expect(() =>
        router.buildNavigationState(null as unknown as string),
      ).toThrowError(/Invalid routeName/);
    });

    it("should throw TypeError for empty string routeName", () => {
      expect(() => router.buildNavigationState("")).toThrowError(TypeError);
      expect(() => router.buildNavigationState("")).toThrowError(
        /Invalid routeName/,
      );
    });

    it("should throw TypeError for invalid routeParams (string)", () => {
      expect(() =>
        router.buildNavigationState("home", "invalid" as never),
      ).toThrowError(TypeError);
      expect(() =>
        router.buildNavigationState("home", "invalid" as never),
      ).toThrowError(/Invalid routeParams/);
    });

    it("should throw TypeError for invalid routeParams (function)", () => {
      expect(() =>
        router.buildNavigationState("home", (() => {}) as never),
      ).toThrowError(TypeError);
      expect(() =>
        router.buildNavigationState("home", (() => {}) as never),
      ).toThrowError(/Invalid routeParams/);
    });

    it("should include 'buildNavigationState' in error message", () => {
      expect(() =>
        router.buildNavigationState(123 as unknown as string),
      ).toThrowError(/buildNavigationState/);
    });
  });

  describe("noValidate mode", () => {
    it("should skip validation when noValidate is true", () => {
      const noValidateRouter = createTestRouter({ noValidate: true });

      noValidateRouter.start();

      // Should not throw even with invalid input
      expect(() =>
        noValidateRouter.buildNavigationState(123 as unknown as string),
      ).not.toThrowError();

      noValidateRouter.stop();
    });
  });

  describe("method binding", () => {
    it("should work when destructured from router", () => {
      const { buildNavigationState } = router;
      const state = buildNavigationState("home");

      expect(state).not.toBeNull();
      expect(state?.name).toBe("home");
    });
  });
});
