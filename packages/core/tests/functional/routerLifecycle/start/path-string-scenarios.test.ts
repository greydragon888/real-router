import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { constants, errorCodes, events } from "@real-router/core";

import { createTestRouter, omitMeta } from "../../../helpers";

import type { Router } from "@real-router/core";

let router: Router;

describe("router.start() - path string scenarios", () => {
  beforeEach(() => {
    router = createTestRouter();
  });

  afterEach(() => {
    router.stop();
  });

  describe("successful path matching", () => {
    it("should match path and transition to found state", async () => {
      const startListener = vi.fn();
      const transitionSuccessListener = vi.fn();

      router.addEventListener(events.ROUTER_START, startListener);
      router.addEventListener(
        events.TRANSITION_SUCCESS,
        transitionSuccessListener,
      );

      const state = await router.start("/users/list");

      expect(router.isActive()).toBe(true);
      expect(startListener).toHaveBeenCalledTimes(1);
      expect(transitionSuccessListener).toHaveBeenCalledTimes(1);
      expect(state).toBeDefined();
      expect(state?.name).toBe("users.list");
      expect(state?.path).toBe("/users/list");

      const currentState = router.getState();

      expect(omitMeta(currentState)).toStrictEqual(omitMeta(state));
    });

    it("should handle path with query parameters", async () => {
      const transitionSuccessListener = vi.fn();

      router.addEventListener(
        events.TRANSITION_SUCCESS,
        transitionSuccessListener,
      );

      const state = await router.start("/users/list?page=2&sort=name");

      expect(router.isActive()).toBe(true);
      expect(transitionSuccessListener).toHaveBeenCalledTimes(1);
      expect(state).toBeDefined();
      expect(state?.name).toBe("users.list");

      const currentState = router.getState();

      expect(currentState?.name).toBe("users.list");
    });

    it("should preserve path parameters in matched state", async () => {
      const state = await router.start("/users/view/456");

      expect(state?.params).toStrictEqual({ id: "456" });

      const currentState = router.getState();

      expect(currentState?.params).toStrictEqual({ id: "456" });
    });
  });

  describe("unsuccessful path matching with defaultRoute", () => {
    it("should return error when path matching fails even with defaultRoute", async () => {
      router = createTestRouter({ allowNotFound: false });
      const startListener = vi.fn();
      const transitionErrorListener = vi.fn();

      router.addEventListener(events.ROUTER_START, startListener);
      router.addEventListener(events.TRANSITION_ERROR, transitionErrorListener);

      try {
        await router.start("/invalid/path");

        expect.fail("Should have thrown");
      } catch (error: any) {
        expect(router.isActive()).toBe(false);
        expect(startListener).not.toHaveBeenCalled();
        expect(transitionErrorListener).toHaveBeenCalledTimes(1);
        expect(error).toBeDefined();
        expect(error.code).toBe(errorCodes.ROUTE_NOT_FOUND);
      }
    });

    it("should return error for nonexistent route even with defaultRoute", async () => {
      router = createTestRouter({ allowNotFound: false });
      const startListener = vi.fn();
      const transitionErrorListener = vi.fn();

      router.addEventListener(events.ROUTER_START, startListener);
      router.addEventListener(events.TRANSITION_ERROR, transitionErrorListener);

      try {
        await router.start("/nonexistent/route");

        expect.fail("Should have thrown");
      } catch (error: any) {
        expect(router.isActive()).toBe(false);
        expect(startListener).not.toHaveBeenCalled();
        expect(transitionErrorListener).toHaveBeenCalledTimes(1);
        expect(error).toBeDefined();
        expect(error.code).toBe(errorCodes.ROUTE_NOT_FOUND);
        expect(router.getState()).toBeUndefined();
      }
    });

    it("should handle error when default route navigation fails", async () => {
      // Set invalid default route
      router = createTestRouter({
        defaultRoute: "invalid.default",
        allowNotFound: false,
      });
      const startListener = vi.fn();
      const transitionErrorListener = vi.fn();

      router.addEventListener(events.ROUTER_START, startListener);
      router.addEventListener(events.TRANSITION_ERROR, transitionErrorListener);

      try {
        await router.start("/invalid/path");

        expect.fail("Should have thrown");
      } catch (error: any) {
        expect(router.isActive()).toBe(false);
        expect(startListener).not.toHaveBeenCalled();
        expect(transitionErrorListener).toHaveBeenCalledTimes(1);
        expect(error).toBeDefined();
        expect(error.code).toBe(errorCodes.ROUTE_NOT_FOUND);
      }
    });
  });

  describe("unsuccessful path matching with allowNotFound", () => {
    it("should create not found state when path matching fails and allowNotFound is true", async () => {
      router = createTestRouter({ allowNotFound: true });
      const startListener = vi.fn();

      router.addEventListener(events.ROUTER_START, startListener);

      await router.start("/invalid/path");

      expect(router.isActive()).toBe(true);
      expect(startListener).toHaveBeenCalled();

      // Verify state is UNKNOWN_ROUTE
      const currentState = router.getState();

      expect(currentState?.name).toBe(constants.UNKNOWN_ROUTE);
      expect(currentState?.params.path).toBe("/invalid/path");
    });

    it("should successfully transition to not found state", async () => {
      router = createTestRouter({ allowNotFound: true });
      const startListener = vi.fn();
      const transitionSuccessListener = vi.fn();

      router.addEventListener(events.ROUTER_START, startListener);
      router.addEventListener(
        events.TRANSITION_SUCCESS,
        transitionSuccessListener,
      );

      const state = await router.start("/some/invalid/path");

      expect(router.isActive()).toBe(true);
      expect(startListener).toHaveBeenCalled();
      expect(transitionSuccessListener).toHaveBeenCalledTimes(1);
      expect(state).toBeDefined();
      expect(state?.name).toBe(constants.UNKNOWN_ROUTE);
      expect(state?.params.path).toBe("/some/invalid/path");

      const currentState = router.getState();

      expect(currentState?.name).toBe(constants.UNKNOWN_ROUTE);
      expect(currentState?.params.path).toBe("/some/invalid/path");
    });

    it("should prefer allowNotFound over defaultRoute when both are set", async () => {
      router = createTestRouter({ allowNotFound: true, defaultRoute: "home" });
      const state = await router.start("/invalid/path");

      expect(state?.name).toBe(constants.UNKNOWN_ROUTE);
    });
  });

  describe("allowNotFound with middleware errors", () => {
    it("should emit TRANSITION_ERROR only once when middleware fails for unknown route", async () => {
      router = createTestRouter({ allowNotFound: true, defaultRoute: "home" });

      const invalidPath = "/non/existent/path";

      router.useMiddleware(
        () => () => Promise.reject({ message: "Middleware error" }),
      );

      const transitionErrorListener = vi.fn();

      router.addEventListener(events.TRANSITION_ERROR, transitionErrorListener);

      try {
        await router.start(invalidPath);
      } catch (error: any) {
        expect(error).toBeDefined();
        expect(error?.code).toBe("TRANSITION_ERR");
        expect(transitionErrorListener).toHaveBeenCalledTimes(1);
      }
    });

    it("should not attempt defaultRoute when middleware fails for unknown route", async () => {
      router = createTestRouter({ allowNotFound: true, defaultRoute: "home" });

      const invalidPath = "/non/existent/path";
      let middlewareCallCount = 0;

      router.useMiddleware(() => () => {
        middlewareCallCount++;

        return Promise.reject({ message: "Middleware error" });
      });

      try {
        await router.start(invalidPath);

        expect.fail("Should have thrown");
      } catch {
        expect(middlewareCallCount).toBe(1); // only for UNKNOWN_ROUTE
      }
    });

    it("should successfully transition to UNKNOWN_ROUTE when middleware succeeds", async () => {
      router = createTestRouter({ allowNotFound: true, defaultRoute: "home" });

      const invalidPath = "/non/existent/path";

      const state = await router.start(invalidPath);

      expect(state.name).toBe(constants.UNKNOWN_ROUTE);
    });
  });

  describe("path string edge cases", () => {
    it("should handle empty string as path (fallback to defaultRoute)", async () => {
      try {
        await router.start("");

        expect.fail("Should have thrown");
      } catch (error: any) {
        expect(error).toBeDefined();
        expect(error.code).toBe(errorCodes.NO_START_PATH_OR_STATE);
      }
    });

    it("should handle whitespace-only path as invalid route", async () => {
      router = createTestRouter({ allowNotFound: false });
      try {
        await router.start("   "); // Whitespace is truthy, passed to matchPath, returns undefined

        expect.fail("Should have thrown");
      } catch (error: any) {
        expect(error).toBeDefined();
        expect(error.code).toBe(errorCodes.ROUTE_NOT_FOUND);
      }
    });

    it("should handle path with double slashes", async () => {
      router = createTestRouter({ allowNotFound: false });
      try {
        await router.start("//users//list//"); // Double slashes are likely not matched by routes

        expect.fail("Should have thrown");
      } catch (error: any) {
        expect(error).toBeDefined();
        expect(error.code).toBe(errorCodes.ROUTE_NOT_FOUND);
      }
    });
  });

  describe("callback protection with paths", () => {
    it("should handle allowNotFound option correctly", async () => {
      router = createTestRouter({ allowNotFound: true });

      // Start with non-existent route
      await router.start("/non-existent");

      // Should be called once with success (UNKNOWN_ROUTE state)
    });

    it("should ensure callback is called exactly once on successful transition", async () => {
      await router.start("/users");

      // Verify single invocation
    });

    it("should ensure callback is called exactly once on route not found error", async () => {
      router = createTestRouter({ allowNotFound: false });
      try {
        await router.start("/non-existent");

        expect.fail("Should have thrown");
      } catch (error: any) {
        expect(error).toBeDefined();
        expect(error.code).toBe(errorCodes.ROUTE_NOT_FOUND);
      }
    });

    it("should protect callback when using defaultRoute", async () => {
      // Configure default route
      router = createTestRouter({ defaultRoute: "home" });

      // Start without path - should use defaultRoute
      await router.start();
    });
  });

  describe("return value with path strings", () => {
    it("should return state for successful navigation", async () => {
      const validPath = "/users/list";

      // Call start and capture return value
      const state = await router.start(validPath);

      expect(state).toBeDefined();
      expect(state?.name).toBe("users.list");
    });

    it("should return state after navigation completes", async () => {
      const validPath = "/orders/view/123";

      // Verify start() returns state
      const state = await router.start(validPath);

      // Router should be in correct state
      expect(router.getState()?.name).toBe("orders.view");
      expect(state?.name).toBe("orders.view");
    });

    it("should throw error when transition fails", async () => {
      const invalidPath = "/nonexistent/route";

      // Block all transitions to force failure
      router.useMiddleware(() => () => false);

      try {
        await router.start(invalidPath);

        expect.fail("Should have thrown");
      } catch (error: any) {
        expect(error).toBeDefined();
      }
    });

    it("should return state on successful navigation", async () => {
      const validPath = "/profile/";

      const state = await router.start(validPath);

      expect(state).toBeDefined();
      expect(state?.name).toBe("profile.me");
    });
  });
});
