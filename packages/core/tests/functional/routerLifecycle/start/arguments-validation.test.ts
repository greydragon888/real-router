import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { constants, errorCodes, events } from "@real-router/core";

import { createTestRouter, omitMeta } from "../../../helpers";

import type { Router } from "@real-router/core";

let router: Router;

const noop = () => undefined;

describe("router.start() - arguments validation", () => {
  beforeEach(() => {
    router = createTestRouter();
  });

  afterEach(() => {
    router.stop();
  });

  describe("arguments validation", () => {
    describe("call without arguments", () => {
      it("should handle start without arguments when defaultRoute is present", () => {
        const startListener = vi.fn();
        const transitionSuccessListener = vi.fn();

        router.addEventListener(events.ROUTER_START, startListener);
        router.addEventListener(
          events.TRANSITION_SUCCESS,
          transitionSuccessListener,
        );

        router.start();

        expect(router.isActive()).toBe(true);
        expect(startListener).toHaveBeenCalledTimes(1);
        expect(transitionSuccessListener).toHaveBeenCalledTimes(1);

        const currentState = router.getState();

        expect(currentState).toBeDefined();
        expect(currentState?.name).toBe("home"); // defaultRoute from createTestRouter
      });

      it("should handle start with defaultParams", () => {
        // Test the defaultParams ?? {} branch when defaultParams is defined
        router = createTestRouter({
          defaultRoute: "items",
          defaultParams: { id: "123" },
        });

        router.start();

        expect(router.isActive()).toBe(true);

        const currentState = router.getState();

        expect(currentState).toBeDefined();
        expect(currentState?.name).toBe("items");
        expect(currentState?.params).toStrictEqual({ id: "123" });
        expect(currentState?.path).toBe("/items/123");
      });

      it("should handle start without defaultParams (undefined)", () => {
        // Test navigateToDefault with undefined defaultParams
        // Reset router and only set defaultRoute without defaultParams
        router.stop();
        router = createTestRouter({ defaultRoute: "home" });

        router.start();

        expect(router.isActive()).toBe(true);

        const currentState = router.getState();

        expect(currentState).toBeDefined();
        expect(currentState?.name).toBe("home");
        expect(currentState?.path).toBe("/home");
        // With undefined defaultParams, empty object is used
        expect(currentState?.params).toStrictEqual({});
      });

      it("should handle start when defaultRoute buildState fails", () => {
        // Test the case where buildState returns falsy in navigateToDefault
        // Use an invalid route name that doesn't exist
        router = createTestRouter({ defaultRoute: "nonexistent-route" });

        const callback = vi.fn();

        router.start(callback);

        expect(router.isActive()).toBe(false);

        const [error] = callback.mock.calls[0];

        expect(error).toBeDefined();
        expect(error?.code).toBe(errorCodes.ROUTE_NOT_FOUND);
        // buildState returns undefined for non-existent routes,
        // triggering the error branch in navigateToDefault
      });
    });

    describe("call with callback function", () => {
      it("should handle start with callback when defaultRoute is present", () => {
        const callback = vi.fn();
        const startListener = vi.fn();
        const transitionSuccessListener = vi.fn();

        router.addEventListener(events.ROUTER_START, startListener);
        router.addEventListener(
          events.TRANSITION_SUCCESS,
          transitionSuccessListener,
        );

        router.start(callback);

        expect(router.isActive()).toBe(true);
        expect(startListener).toHaveBeenCalledTimes(1);
        expect(transitionSuccessListener).toHaveBeenCalledTimes(1);
        expect(callback).toHaveBeenCalledTimes(1);

        const [error, state] = callback.mock.calls[0];

        expect(error).toBeUndefined();
        expect(state).toBeDefined();
        expect(state?.name).toBe("home");

        const currentState = router.getState();

        expect(omitMeta(currentState)).toStrictEqual(omitMeta(state));
      });
    });

    describe("call with path string", () => {
      it("should handle start with valid path", () => {
        const startListener = vi.fn();
        const transitionSuccessListener = vi.fn();

        router.addEventListener(events.ROUTER_START, startListener);
        router.addEventListener(
          events.TRANSITION_SUCCESS,
          transitionSuccessListener,
        );

        router.start("/users/list");

        expect(router.isActive()).toBe(true);
        expect(startListener).toHaveBeenCalledTimes(1);
        expect(transitionSuccessListener).toHaveBeenCalledTimes(1);

        const currentState = router.getState();

        expect(currentState).toBeDefined();
        expect(currentState?.name).toBe("users.list");
        expect(currentState?.path).toBe("/users/list");
      });

      it("should not handle start with invalid path when defaultRoute is present", () => {
        router = createTestRouter({ allowNotFound: false });

        const startListener = vi.fn();
        const transitionErrorListener = vi.fn();
        const callbackSpy = vi.fn();

        router.addEventListener(events.ROUTER_START, startListener);
        router.addEventListener(
          events.TRANSITION_ERROR,
          transitionErrorListener,
        );

        router.start("/invalid/path", callbackSpy);

        expect(router.isActive()).toBe(false);
        expect(startListener).not.toHaveBeenCalled();
        expect(transitionErrorListener).toHaveBeenCalledTimes(1);

        const [error] = callbackSpy.mock.calls[0];

        expect(error).toBeDefined();
        expect(error.code).toBe(errorCodes.ROUTE_NOT_FOUND);

        expect(router.getState()).toBeUndefined();
      });

      it("should handle start with invalid path when allowNotFound is true", () => {
        router = createTestRouter({ allowNotFound: true });

        const startListener = vi.fn();
        const transitionSuccessListener = vi.fn();

        router.addEventListener(events.ROUTER_START, startListener);
        router.addEventListener(
          events.TRANSITION_SUCCESS,
          transitionSuccessListener,
        );

        router.start("/invalid/path");

        expect(router.isActive()).toBe(true);
        expect(startListener).toHaveBeenCalled();
        expect(transitionSuccessListener).toHaveBeenCalledTimes(1);

        const currentState = router.getState();

        expect(currentState).toBeDefined();
        expect(currentState?.name).toBe(constants.UNKNOWN_ROUTE);
        expect(currentState?.params.path).toBe("/invalid/path");
      });
    });

    describe("call with state object", () => {
      it("should handle start with valid state object", () => {
        const startState = {
          name: "users.list",
          params: {},
          path: "/users/list",
        };
        const startListener = vi.fn();
        const transitionSuccessListener = vi.fn();

        router.addEventListener(events.ROUTER_START, startListener);
        router.addEventListener(
          events.TRANSITION_SUCCESS,
          transitionSuccessListener,
        );

        router.start(startState);

        expect(router.isActive()).toBe(true);
        expect(startListener).toHaveBeenCalledTimes(1);
        expect(transitionSuccessListener).toHaveBeenCalledTimes(1);

        const currentState = router.getState();

        expect(omitMeta(currentState)).toStrictEqual(startState);
      });

      it("should handle start with state object and callback", () => {
        const startState = {
          name: "orders.pending",
          params: {},
          path: "/orders/pending",
        };
        const callback = vi.fn();
        const startListener = vi.fn();

        router.addEventListener(events.ROUTER_START, startListener);

        router.start(startState, callback);

        expect(router.isActive()).toBe(true);
        expect(startListener).toHaveBeenCalledTimes(1);
        expect(callback).toHaveBeenCalledTimes(1);

        const [error, state] = callback.mock.calls[0];

        expect(error).toBeUndefined();
        expect(omitMeta(state)).toStrictEqual(startState);

        const currentState = router.getState();

        expect(omitMeta(currentState)).toStrictEqual(startState);
      });

      it("should handle start with state object containing params", () => {
        const startState = {
          name: "users.view",
          params: { id: "123" },
          path: "/users/view/123",
        };
        const startListener = vi.fn();

        router.addEventListener(events.ROUTER_START, startListener);

        router.start(startState);

        expect(router.isActive()).toBe(true);
        expect(startListener).toHaveBeenCalledTimes(1);

        const currentState = router.getState();

        expect(omitMeta(currentState)).toStrictEqual(startState);
        expect(currentState?.params).toStrictEqual({ id: "123" });
      });
    });

    describe("call with path and callback", () => {
      it("should handle start with valid path and callback", () => {
        const callback = vi.fn();
        const startListener = vi.fn();
        const transitionSuccessListener = vi.fn();

        router.addEventListener(events.ROUTER_START, startListener);
        router.addEventListener(
          events.TRANSITION_SUCCESS,
          transitionSuccessListener,
        );

        router.start("/users/list", callback);

        expect(router.isActive()).toBe(true);
        expect(startListener).toHaveBeenCalledTimes(1);
        expect(transitionSuccessListener).toHaveBeenCalledTimes(1);
        expect(callback).toHaveBeenCalledTimes(1);

        const [error, state] = callback.mock.calls[0];

        expect(error).toBeUndefined();
        expect(state).toBeDefined();
        expect(state?.name).toBe("users.list");
        expect(state?.path).toBe("/users/list");

        const currentState = router.getState();

        expect(omitMeta(currentState)).toStrictEqual(omitMeta(state));
      });

      it("should not handle start with invalid path and callback when defaultRoute is present", () => {
        router = createTestRouter({ allowNotFound: false });

        const callback = vi.fn();
        const startListener = vi.fn();
        const transitionErrorListener = vi.fn();

        router.addEventListener(events.ROUTER_START, startListener);
        router.addEventListener(
          events.TRANSITION_ERROR,
          transitionErrorListener,
        );

        router.start("/invalid/path", callback);

        expect(router.isActive()).toBe(false);
        expect(startListener).not.toHaveBeenCalled();
        expect(transitionErrorListener).toHaveBeenCalledTimes(1);
        expect(callback).toHaveBeenCalledTimes(1);

        const [error, state] = callback.mock.calls[0];

        expect(error).toBeDefined();
        expect(error.code).toBe(errorCodes.ROUTE_NOT_FOUND);
        expect(state).toBeUndefined();

        expect(router.getState()).toBeUndefined();
      });

      it("should not handle start with invalid path and callback when allowNotFound is true", () => {
        router = createTestRouter({ allowNotFound: true });

        const callback = vi.fn();
        const startListener = vi.fn();
        const transitionSuccessListener = vi.fn();

        router.addEventListener(events.ROUTER_START, startListener);
        router.addEventListener(
          events.TRANSITION_SUCCESS,
          transitionSuccessListener,
        );

        router.start("/invalid/path", callback);

        expect(router.isActive()).toBe(true);
        expect(startListener).toHaveBeenCalled();
        expect(transitionSuccessListener).toHaveBeenCalledTimes(1);
        expect(callback).toHaveBeenCalledTimes(1);

        const [error, state] = callback.mock.calls[0];

        expect(error).toBeUndefined();
        expect(state).toBeDefined();
        expect(state?.name).toBe(constants.UNKNOWN_ROUTE);
        expect(state?.params.path).toBe("/invalid/path");

        const currentState = router.getState();

        expect(omitMeta(currentState)).toStrictEqual(omitMeta(state));
      });
    });

    describe("call with state object and callback", () => {
      it("should handle start with valid state object and callback", () => {
        const startState = {
          name: "users.list",
          params: {},
          path: "/users/list",
        };
        const callback = vi.fn();
        const startListener = vi.fn();
        const transitionSuccessListener = vi.fn();

        router.addEventListener(events.ROUTER_START, startListener);
        router.addEventListener(
          events.TRANSITION_SUCCESS,
          transitionSuccessListener,
        );

        router.start(startState, callback);

        expect(router.isActive()).toBe(true);
        expect(startListener).toHaveBeenCalledTimes(1);
        expect(transitionSuccessListener).toHaveBeenCalledTimes(1);
        expect(callback).toHaveBeenCalledTimes(1);

        const [error, state] = callback.mock.calls[0];

        expect(error).toBeUndefined();
        expect(omitMeta(state)).toStrictEqual(startState);

        const currentState = router.getState();

        expect(omitMeta(currentState)).toStrictEqual(startState);
      });

      it("should handle start with state object containing params and callback", () => {
        const startState = {
          name: "users.view",
          params: { id: "456" },
          path: "/users/view/456",
        };
        const callback = vi.fn();
        const startListener = vi.fn();
        const transitionSuccessListener = vi.fn();

        router.addEventListener(events.ROUTER_START, startListener);
        router.addEventListener(
          events.TRANSITION_SUCCESS,
          transitionSuccessListener,
        );

        router.start(startState, callback);

        expect(router.isActive()).toBe(true);
        expect(startListener).toHaveBeenCalledTimes(1);
        expect(transitionSuccessListener).toHaveBeenCalledTimes(1);
        expect(callback).toHaveBeenCalledTimes(1);

        const [error, state] = callback.mock.calls[0];

        expect(error).toBeUndefined();
        expect(omitMeta(state)).toStrictEqual(startState);
        expect(state?.params).toStrictEqual({ id: "456" });

        const currentState = router.getState();

        expect(omitMeta(currentState)).toStrictEqual(startState);
        expect(currentState?.params).toStrictEqual({ id: "456" });
      });

      // Now correctly validates state objects and returns ROUTE_NOT_FOUND error
      it("should handle start with invalid state object and callback", () => {
        router = createTestRouter({ allowNotFound: false });

        const startState = {
          name: "nonexistent.route",
          params: {},
          path: "/nonexistent",
        };
        const callback = vi.fn();
        const startListener = vi.fn();
        const transitionErrorListener = vi.fn();

        router.addEventListener(events.ROUTER_START, startListener);
        router.addEventListener(
          events.TRANSITION_ERROR,
          transitionErrorListener,
        );

        router.start(startState, callback);

        // Router should NOT start when validation fails with allowNotFound = false
        expect(router.isActive()).toBe(false);
        expect(startListener).not.toHaveBeenCalled();
        expect(transitionErrorListener).toHaveBeenCalledTimes(1);
        expect(callback).toHaveBeenCalledTimes(1);

        const [error, state] = callback.mock.calls[0];

        expect(error).toBeDefined();
        expect(error.code).toBe(errorCodes.ROUTE_NOT_FOUND);
        expect(state).toBeUndefined();

        expect(router.getState()).toBeUndefined();
      });
    });

    describe("call with invalid number of arguments", () => {
      it("should throw error when called with more than 2 arguments", () => {
        expect(() => {
          // @ts-expect-error - testing invalid argument count
          router.start("path", {}, {}, noop);
        }).toThrowError("Invalid number of arguments");
      });

      it("should throw error when called with 3 arguments", () => {
        expect(() => {
          // @ts-expect-error - testing invalid argument count
          router.start("path", noop, "extra");
        }).toThrowError("Invalid number of arguments");
      });
    });
  });

  describe("router state check", () => {
    describe("repeated start of already started router", () => {
      it("should return error when starting already started router", () => {
        router.start();

        const callback = vi.fn();
        const startListener = vi.fn();

        router.addEventListener(events.ROUTER_START, startListener);

        const result = router.start(callback);

        expect(router.isActive()).toBe(true);
        expect(startListener).not.toHaveBeenCalled();
        expect(callback).toHaveBeenCalledTimes(1);
        expect(result).toBe(router);

        const [error] = callback.mock.calls[0];

        expect(error).toBeDefined();
        expect(error.code).toBe(errorCodes.ROUTER_ALREADY_STARTED);
      });

      it("should not execute start logic when router is already started", () => {
        router.start();

        const transitionStartListener = vi.fn();
        const transitionSuccessListener = vi.fn();

        router.addEventListener(
          events.TRANSITION_START,
          transitionStartListener,
        );
        router.addEventListener(
          events.TRANSITION_SUCCESS,
          transitionSuccessListener,
        );

        router.start("/users/list");

        expect(transitionStartListener).not.toHaveBeenCalled();
        expect(transitionSuccessListener).not.toHaveBeenCalled();
      });

      it("should maintain current state when attempting to restart", () => {
        router.start("/users/list");
        const initialState = router.getState();

        const callback = vi.fn();

        router.start("/orders/pending", callback);

        const currentState = router.getState();

        expect(omitMeta(currentState)).toStrictEqual(omitMeta(initialState));
        expect(currentState?.name).toBe("users.list");

        const [error] = callback.mock.calls[0];

        expect(error.code).toBe(errorCodes.ROUTER_ALREADY_STARTED);
      });
    });
  });
});
