import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { events } from "@real-router/core";

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

      expect(state).toBeDefined();
      expect(state?.name).toBe("home");
      expect(state?.params).toStrictEqual({});
    });

    it("should return State for existing route with params", () => {
      const state = router.buildNavigationState("items", { id: "123" });

      expect(state).toBeDefined();
      expect(state?.name).toBe("items");
      expect(state?.params).toStrictEqual({ id: "123" });
    });

    it("should return State with correct path", () => {
      const state = router.buildNavigationState("items", { id: "456" });

      expect(state).toBeDefined();
      expect(state?.path).toBe("/items/456");
    });

    it("should return State with correct meta", () => {
      const state = router.buildNavigationState("home");

      expect(state).toBeDefined();
      expect(state?.meta).toBeDefined();
      expect(state?.meta?.id).toBeGreaterThanOrEqual(0);
      expect(state?.meta?.params).toBeDefined();
    });

    it("should return frozen State (immutable)", () => {
      const state = router.buildNavigationState("home");

      expect(state).toBeDefined();
      expect(Object.isFrozen(state)).toBe(true);
      expect(Object.isFrozen(state?.params)).toBe(true);
      expect(Object.isFrozen(state?.meta)).toBe(true);
    });

    it("should return State with meta.options as empty object", () => {
      const state = router.buildNavigationState("home");

      expect(state).toBeDefined();
      expect(state?.meta?.options).toStrictEqual({});
    });

    it("should return State with meta.redirected as false", () => {
      const state = router.buildNavigationState("home");

      expect(state).toBeDefined();
      expect(state?.meta?.redirected).toBe(false);
    });
  });

  describe("route not found", () => {
    it("should return undefined for non-existent route", () => {
      const state = router.buildNavigationState("nonexistent");

      expect(state).toBeUndefined();
    });

    it("should return undefined (not null) for non-existent route", () => {
      const state = router.buildNavigationState("nonexistent.route");

      expect(state).toBeUndefined();
      expect(state).not.toBeNull();
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

      expect(state).toBeDefined();
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

      expect(state).toBeDefined();
      expect(state?.params).toStrictEqual({ id: "default-id" });
    });
  });

  describe("params defaulting", () => {
    it("should use empty object when params not provided", () => {
      const state = router.buildNavigationState("home");

      expect(state).toBeDefined();
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

    it("should return undefined for empty string routeName", () => {
      const state = router.buildNavigationState("");

      expect(state).toBeUndefined();
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

  describe("no side effects (pure function)", () => {
    it("should not change router state", () => {
      router.navigate("users", {}, {}, () => {});

      const stateBefore = router.getState();

      router.buildNavigationState("orders");

      const stateAfter = router.getState();

      expect(stateAfter).toBe(stateBefore);
    });

    it("should not emit any transition events", () => {
      const onStart = vi.fn();
      const onSuccess = vi.fn();
      const onError = vi.fn();

      const unsub1 = router.addEventListener(events.TRANSITION_START, onStart);
      const unsub2 = router.addEventListener(
        events.TRANSITION_SUCCESS,
        onSuccess,
      );
      const unsub3 = router.addEventListener(events.TRANSITION_ERROR, onError);

      router.buildNavigationState("home");
      router.buildNavigationState("nonexistent");

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

      const state = stoppedRouter.buildNavigationState("home");

      expect(state).toBeDefined();
      expect(state?.name).toBe("home");
    });
  });

  describe("noValidate mode", () => {
    it("should skip validation and return undefined for invalid input", () => {
      const noValidateRouter = createTestRouter({ noValidate: true });

      noValidateRouter.start();

      const result = noValidateRouter.buildNavigationState(
        123 as unknown as string,
      );

      expect(result).toBeUndefined();

      noValidateRouter.stop();
    });
  });

  describe("method binding", () => {
    it("should work when destructured from router", () => {
      const { buildNavigationState } = router;
      const state = buildNavigationState("home");

      expect(state).toBeDefined();
      expect(state?.name).toBe("home");
    });
  });
});
