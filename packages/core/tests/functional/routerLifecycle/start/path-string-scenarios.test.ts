import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { constants, errorCodes, events } from "@real-router/core";

import { createTestRouter, omitMeta } from "../../../helpers";

import type { Router } from "@real-router/core";

let router: Router;
const noop = () => undefined;

describe("router.start() - path string scenarios", () => {
  beforeEach(() => {
    router = createTestRouter();
  });

  afterEach(() => {
    router.stop();
  });

  describe("successful path matching", () => {
    it("should match path and transition to found state", () => {
      const callback = vi.fn();
      const startListener = vi.fn();
      const transitionSuccessListener = vi.fn();

      router.addEventListener(events.ROUTER_START, startListener);
      router.addEventListener(
        events.TRANSITION_SUCCESS,
        transitionSuccessListener,
      );

      const result = router.start("/users/list", callback);

      expect(router.isActive()).toBe(true);
      expect(startListener).toHaveBeenCalledTimes(1);
      expect(transitionSuccessListener).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledTimes(1);
      expect(result).toBe(router);

      const [error, state] = callback.mock.calls[0];

      expect(error).toBeUndefined();
      expect(state).toBeDefined();
      expect(state?.name).toBe("users.list");
      expect(state?.path).toBe("/users/list");

      const currentState = router.getState();

      expect(omitMeta(currentState)).toStrictEqual(omitMeta(state));
    });

    it("should handle path with query parameters", () => {
      const callback = vi.fn();
      const transitionSuccessListener = vi.fn();

      router.addEventListener(
        events.TRANSITION_SUCCESS,
        transitionSuccessListener,
      );

      router.start("/users/list?page=2&sort=name", callback);

      expect(router.isActive()).toBe(true);
      expect(transitionSuccessListener).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledTimes(1);

      const [error, state] = callback.mock.calls[0];

      expect(error).toBeUndefined();
      expect(state).toBeDefined();
      expect(state?.name).toBe("users.list");

      const currentState = router.getState();

      expect(currentState?.name).toBe("users.list");
    });

    it("should preserve path parameters in matched state", () => {
      const callback = vi.fn();

      router.start("/users/view/456", callback);

      const [error, state] = callback.mock.calls[0];

      expect(error).toBeUndefined();
      expect(state?.params).toStrictEqual({ id: "456" });

      const currentState = router.getState();

      expect(currentState?.params).toStrictEqual({ id: "456" });
    });
  });

  describe("unsuccessful path matching with defaultRoute", () => {
    it("should return error when path matching fails even with defaultRoute", () => {
      router = createTestRouter({ allowNotFound: false });

      const callback = vi.fn();
      const startListener = vi.fn();
      const transitionErrorListener = vi.fn();

      router.addEventListener(events.ROUTER_START, startListener);
      router.addEventListener(events.TRANSITION_ERROR, transitionErrorListener);

      const result = router.start("/invalid/path", callback);

      expect(router.isActive()).toBe(false);
      expect(startListener).not.toHaveBeenCalled();
      expect(transitionErrorListener).toHaveBeenCalledTimes(1);
      expect(result).toBe(router);

      const [error] = callback.mock.calls[0];

      expect(error).toBeDefined();
      expect(error.code).toBe(errorCodes.ROUTE_NOT_FOUND);
    });

    it("should return error for nonexistent route even with defaultRoute", () => {
      router = createTestRouter({ allowNotFound: false });

      const callback = vi.fn();
      const startListener = vi.fn();
      const transitionErrorListener = vi.fn();

      router.addEventListener(events.ROUTER_START, startListener);
      router.addEventListener(events.TRANSITION_ERROR, transitionErrorListener);

      const result = router.start("/nonexistent/route", callback);

      expect(router.isActive()).toBe(false);
      expect(startListener).not.toHaveBeenCalled();
      expect(transitionErrorListener).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledTimes(1);
      expect(result).toBe(router);

      const [error, state] = callback.mock.calls[0];

      expect(error).toBeDefined();
      expect(error.code).toBe(errorCodes.ROUTE_NOT_FOUND);
      expect(state).toBeUndefined();
      expect(router.getState()).toBeUndefined();
    });

    it("should handle error when default route navigation fails", () => {
      // Set invalid default route
      router = createTestRouter({
        defaultRoute: "invalid.default",
        allowNotFound: false,
      });

      const callback = vi.fn();
      const startListener = vi.fn();
      const transitionErrorListener = vi.fn();

      router.addEventListener(events.ROUTER_START, startListener);
      router.addEventListener(events.TRANSITION_ERROR, transitionErrorListener);

      const result = router.start("/invalid/path", callback);

      expect(router.isActive()).toBe(false);
      expect(startListener).not.toHaveBeenCalled();
      expect(transitionErrorListener).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledTimes(1);
      expect(result).toBe(router);

      const [error] = callback.mock.calls[0];

      expect(error).toBeDefined();
      expect(error.code).toBe(errorCodes.ROUTE_NOT_FOUND);
    });
  });

  describe("unsuccessful path matching with allowNotFound", () => {
    it("should create not found state when path matching fails and allowNotFound is true", () => {
      router = createTestRouter({ allowNotFound: true });

      const callback = vi.fn();
      const startListener = vi.fn();

      router.addEventListener(events.ROUTER_START, startListener);

      const result = router.start("/invalid/path", callback);

      expect(router.isActive()).toBe(true);
      expect(startListener).toHaveBeenCalled();
      expect(result).toBe(router);

      // Verify state is UNKNOWN_ROUTE
      const currentState = router.getState();

      expect(currentState?.name).toBe(constants.UNKNOWN_ROUTE);
      expect(currentState?.params.path).toBe("/invalid/path");
    });

    it("should successfully transition to not found state", () => {
      router = createTestRouter({ allowNotFound: true });

      const callback = vi.fn();
      const startListener = vi.fn();
      const transitionSuccessListener = vi.fn();

      router.addEventListener(events.ROUTER_START, startListener);
      router.addEventListener(
        events.TRANSITION_SUCCESS,
        transitionSuccessListener,
      );

      const result = router.start("/some/invalid/path", callback);

      expect(router.isActive()).toBe(true);
      expect(startListener).toHaveBeenCalled();
      expect(transitionSuccessListener).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledTimes(1);
      expect(result).toBe(router);

      const [error, state] = callback.mock.calls[0];

      expect(error).toBeUndefined();
      expect(state).toBeDefined();
      expect(state?.name).toBe(constants.UNKNOWN_ROUTE);
      expect(state?.params.path).toBe("/some/invalid/path");

      const currentState = router.getState();

      expect(currentState?.name).toBe(constants.UNKNOWN_ROUTE);
      expect(currentState?.params.path).toBe("/some/invalid/path");
    });

    it("should prefer allowNotFound over defaultRoute when both are set", () => {
      router = createTestRouter({ allowNotFound: true, defaultRoute: "home" });

      const callback = vi.fn();

      router.start("/invalid/path", callback);

      const [error, state] = callback.mock.calls[0];

      expect(error).toBeUndefined();
      expect(state?.name).toBe(constants.UNKNOWN_ROUTE);
    });
  });

  describe("allowNotFound with middleware errors", () => {
    it("should emit TRANSITION_ERROR only once when middleware fails for unknown route", () => {
      router = createTestRouter({ allowNotFound: true, defaultRoute: "home" });

      const invalidPath = "/non/existent/path";

      router.useMiddleware(
        () => () => Promise.reject({ message: "Middleware error" }),
      );

      const transitionErrorListener = vi.fn();

      router.addEventListener(events.TRANSITION_ERROR, transitionErrorListener);

      router.start(invalidPath, (err) => {
        expect(err).toBeDefined();
        expect(err?.code).toBe("TRANSITION_ERR");
        expect(transitionErrorListener).toHaveBeenCalledTimes(1);
      });
    });

    it("should not attempt defaultRoute when middleware fails for unknown route", () => {
      router = createTestRouter({ allowNotFound: true, defaultRoute: "home" });

      const invalidPath = "/non/existent/path";
      let middlewareCallCount = 0;

      router.useMiddleware(() => () => {
        middlewareCallCount++;

        return Promise.reject({ message: "Middleware error" });
      });

      router.start(invalidPath, () => {
        expect(middlewareCallCount).toBe(1); // only for UNKNOWN_ROUTE
      });
    });

    it("should successfully transition to UNKNOWN_ROUTE when middleware succeeds", async () => {
      router = createTestRouter({ allowNotFound: true, defaultRoute: "home" });

      const invalidPath = "/non/existent/path";

      const state = await router.start(invalidPath);

      expect(state.name).toBe(constants.UNKNOWN_ROUTE);
    });
  });

  describe("path string edge cases", () => {
    it("should handle empty string as path (fallback to defaultRoute)", () => {
      router.start("");

      expect(router.isActive()).toBe(true);
      // Empty string triggers fallback to defaultRoute
      expect(router.getState()?.name).toBe("home");
    });

    it("should handle whitespace-only path as invalid route", () => {
      router = createTestRouter({ allowNotFound: false });

      const callback = vi.fn();

      router.start("   ", callback);

      expect(callback).toHaveBeenCalledTimes(1);

      const [error] = callback.mock.calls[0];

      // Whitespace is truthy, passed to matchPath, returns undefined
      expect(error).toBeDefined();
      expect(error.code).toBe(errorCodes.ROUTE_NOT_FOUND);
    });

    it("should handle path with double slashes", () => {
      router = createTestRouter({ allowNotFound: false });

      const callback = vi.fn();

      router.start("//users//list//", callback);

      expect(callback).toHaveBeenCalledTimes(1);

      const [error] = callback.mock.calls[0];

      // Double slashes are likely not matched by routes
      expect(error).toBeDefined();
      expect(error.code).toBe(errorCodes.ROUTE_NOT_FOUND);
    });
  });

  describe("callback protection with paths", () => {
    it("should handle allowNotFound option correctly", () => {
      const callback = vi.fn();

      router = createTestRouter({ allowNotFound: true });

      // Start with non-existent route
      router.start("/non-existent", callback);

      // Should be called once with success (UNKNOWN_ROUTE state)
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({
          name: constants.UNKNOWN_ROUTE,
        }),
      );
    });

    it("should ensure callback is called exactly once on successful transition", () => {
      const callback = vi.fn();

      router.start("/users", callback);

      // Verify single invocation
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({
          name: "users",
          path: "/users",
        }),
      );
    });

    it("should ensure callback is called exactly once on route not found error", () => {
      router = createTestRouter({ allowNotFound: false });

      const callback = vi.fn();

      router.start("/non-existent", callback);

      // Verify single invocation with error
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          code: errorCodes.ROUTE_NOT_FOUND,
        }),
        undefined,
      );
    });

    it("should protect callback when using defaultRoute", () => {
      const callback = vi.fn();

      // Configure default route
      router = createTestRouter({ defaultRoute: "home" });

      // Start without path - should use defaultRoute
      router.start(callback);

      // Callback should be called only once
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({
          name: "home",
        }),
      );
    });
  });

  describe("return value with path strings", () => {
    it("should return router instance for method chaining", () => {
      const validPath = "/users/list";

      // Call start and capture return value
      const result = router.start(validPath);

      // Should return the same router instance
      expect(result).toBe(router);
      expect(result).toBeInstanceOf(Object); // Router class instance
    });

    it("should support method chaining with router methods that return router", () => {
      const validPath = "/orders/view/123";

      // Method chaining should work for methods that return router
      expect(() => {
        router.start(validPath).stop();
      }).not.toThrowError();

      // Verify start() returns router for chaining
      const result = router.start(validPath);

      expect(result).toBe(router);

      // Router should be in correct state
      expect(router.getState()?.name).toBe("orders.view");
    });

    it("should return router instance even when transition fails", () => {
      const invalidPath = "/nonexistent/route";

      // Block all transitions to force failure
      router.useMiddleware(() => () => false);

      const result = router.start(invalidPath);

      // Should still return router instance even on failure
      expect(result).toBe(router);
    });

    it("should return router instance with callback parameter", () => {
      const validPath = "/profile/me";

      const result = router.start(validPath, noop);

      // Should return router instance when using callback
      expect(result).toBe(router);
    });
  });
});
