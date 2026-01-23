import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { errorCodes, events, RouterError } from "@real-router/core";

import { createTestRouter } from "../../../helpers";

import type { Router } from "@real-router/core";

let router: Router;

describe("router.start() - lifecycle events", () => {
  beforeEach(() => {
    router = createTestRouter();
  });

  afterEach(() => {
    router.stop();
  });

  describe("router lifecycle events", () => {
    describe("ROUTER_START event emission", () => {
      it("should emit ROUTER_START event when starting router", () => {
        const startListener = vi.fn();

        router.addEventListener(events.ROUTER_START, startListener);

        router.start();

        expect(router.isStarted()).toBe(true);
        expect(startListener).toHaveBeenCalledTimes(1);
      });

      // Issue: Two-phase start - ROUTER_START emits AFTER successful transition
      it("should emit ROUTER_START event after transition succeeds (two-phase start)", () => {
        const startListener = vi.fn();
        const transitionStartListener = vi.fn();
        const transitionSuccessListener = vi.fn();

        router.addEventListener(events.ROUTER_START, startListener);
        router.addEventListener(
          events.TRANSITION_START,
          transitionStartListener,
        );
        router.addEventListener(
          events.TRANSITION_SUCCESS,
          transitionSuccessListener,
        );

        router.start();

        expect(startListener).toHaveBeenCalledTimes(1);
        expect(transitionStartListener).toHaveBeenCalledTimes(1);
        expect(transitionSuccessListener).toHaveBeenCalledTimes(1);

        const startOrder = startListener.mock.invocationCallOrder[0];
        const transitionStartOrder =
          transitionStartListener.mock.invocationCallOrder[0];
        const transitionSuccessOrder =
          transitionSuccessListener.mock.invocationCallOrder[0];

        // Issue #50: Two-phase start ensures ROUTER_START comes after TRANSITION_START
        // but before TRANSITION_SUCCESS (handleTransitionComplete sets started then emits)
        expect(transitionStartOrder).toBeLessThan(startOrder);
        expect(startOrder).toBeLessThan(transitionSuccessOrder);
      });
    });
  });

  describe("Issue #45: Consistent TRANSITION_ERROR event emission for all error types", () => {
    describe("ROUTE_NOT_FOUND should emit TRANSITION_ERROR", () => {
      beforeEach(() => {
        router.setOption("allowNotFound", false);
      });

      it("should emit TRANSITION_ERROR for invalid path", () => {
        const transitionErrorListener = vi.fn();

        router.addEventListener(
          events.TRANSITION_ERROR,
          transitionErrorListener,
        );

        router.start("/nonexistent/path");

        expect(transitionErrorListener).toHaveBeenCalledTimes(1);

        const [toState, fromState, error] =
          transitionErrorListener.mock.calls[0];

        expect(toState).toBeUndefined();
        expect(fromState).toBeUndefined();
        expect(error.code).toBe(errorCodes.ROUTE_NOT_FOUND);
      });

      it("should emit TRANSITION_ERROR for invalid state object", () => {
        const transitionErrorListener = vi.fn();

        router.addEventListener(
          events.TRANSITION_ERROR,
          transitionErrorListener,
        );

        router.start({
          name: "nonexistent.route",
          params: {},
          path: "/nonexistent",
        });

        expect(transitionErrorListener).toHaveBeenCalledTimes(1);

        const error = transitionErrorListener.mock.calls[0][2];

        expect(error.code).toBe(errorCodes.ROUTE_NOT_FOUND);
      });

      it("should return error to callback AND emit TRANSITION_ERROR", () => {
        const transitionErrorListener = vi.fn();
        const callback = vi.fn();

        router.addEventListener(
          events.TRANSITION_ERROR,
          transitionErrorListener,
        );

        router.start("/nonexistent/path", callback);

        // Both callback AND event should be triggered
        expect(callback).toHaveBeenCalledTimes(1);
        expect(transitionErrorListener).toHaveBeenCalledTimes(1);

        // Both should have the same error
        const [callbackError] = callback.mock.calls[0];
        const eventError = transitionErrorListener.mock.calls[0][2];

        expect(callbackError.code).toBe(errorCodes.ROUTE_NOT_FOUND);
        expect(eventError.code).toBe(errorCodes.ROUTE_NOT_FOUND);
      });
    });

    describe("NO_START_PATH_OR_STATE should emit TRANSITION_ERROR", () => {
      it("should emit TRANSITION_ERROR when no start path and no default route", () => {
        // Create router without default route
        const routerWithoutDefault = createTestRouter({ defaultRoute: "" });
        const transitionErrorListener = vi.fn();

        routerWithoutDefault.addEventListener(
          events.TRANSITION_ERROR,
          transitionErrorListener,
        );

        routerWithoutDefault.start();

        expect(transitionErrorListener).toHaveBeenCalledTimes(1);

        const [toState, fromState, error] =
          transitionErrorListener.mock.calls[0];

        expect(toState).toBeUndefined();
        expect(fromState).toBeUndefined();
        expect(error.code).toBe(errorCodes.NO_START_PATH_OR_STATE);

        routerWithoutDefault.stop();
      });

      it("should return error to callback AND emit TRANSITION_ERROR", () => {
        const routerWithoutDefault = createTestRouter({ defaultRoute: "" });
        const transitionErrorListener = vi.fn();
        const callback = vi.fn();

        routerWithoutDefault.addEventListener(
          events.TRANSITION_ERROR,
          transitionErrorListener,
        );

        routerWithoutDefault.start(callback);

        // Both callback AND event should be triggered
        expect(callback).toHaveBeenCalledTimes(1);
        expect(transitionErrorListener).toHaveBeenCalledTimes(1);

        // Both should have the same error code
        const [callbackError] = callback.mock.calls[0];
        const eventError = transitionErrorListener.mock.calls[0][2];

        expect(callbackError.code).toBe(errorCodes.NO_START_PATH_OR_STATE);
        expect(eventError.code).toBe(errorCodes.NO_START_PATH_OR_STATE);

        routerWithoutDefault.stop();
      });
    });

    describe("TRANSITION_ERR should emit TRANSITION_ERROR", () => {
      it("should emit TRANSITION_ERROR when guard blocks transition", () => {
        const navigateToStateSpy = vi.spyOn(router, "navigateToState");
        const transitionErrorListener = vi.fn();

        // Mock navigateToState to simulate guard failure
        navigateToStateSpy.mockImplementationOnce(
          (toState, _fromState, _options, done) => {
            const err = new RouterError(errorCodes.TRANSITION_ERR, {
              message: "Guard blocked",
            });

            // navigateToState emits TRANSITION_ERROR internally
            router.invokeEventListeners(
              events.TRANSITION_ERROR,
              toState,
              undefined,
              err,
            );
            done(err);

            return () => {};
          },
        );

        router.addEventListener(
          events.TRANSITION_ERROR,
          transitionErrorListener,
        );

        router.start("/users/list");

        expect(transitionErrorListener).toHaveBeenCalledTimes(1);

        const error = transitionErrorListener.mock.calls[0][2];

        expect(error.code).toBe(errorCodes.TRANSITION_ERR);
      });

      it("should emit TRANSITION_ERROR with toState information", () => {
        const navigateToStateSpy = vi.spyOn(router, "navigateToState");
        const transitionErrorListener = vi.fn();

        navigateToStateSpy.mockImplementationOnce(
          (toState, _fromState, _options, done) => {
            const err = new RouterError(errorCodes.TRANSITION_ERR);

            router.invokeEventListeners(
              events.TRANSITION_ERROR,
              toState,
              undefined,
              err,
            );
            done(err);

            return () => {};
          },
        );

        router.addEventListener(
          events.TRANSITION_ERROR,
          transitionErrorListener,
        );

        router.start("/users/view/123");

        expect(transitionErrorListener).toHaveBeenCalledTimes(1);

        const [toState, fromState, error] =
          transitionErrorListener.mock.calls[0];

        // toState should be provided when available
        expect(toState).toBeDefined();
        expect(toState.name).toBe("users.view");
        expect(toState.params).toStrictEqual({ id: "123" });
        expect(fromState).toBeUndefined();
        expect(error.code).toBe(errorCodes.TRANSITION_ERR);
      });

      it("should return error to callback AND emit TRANSITION_ERROR", () => {
        const navigateToStateSpy = vi.spyOn(router, "navigateToState");
        const transitionErrorListener = vi.fn();
        const callback = vi.fn();

        navigateToStateSpy.mockImplementationOnce(
          (toState, _fromState, _options, done) => {
            const err = new RouterError(errorCodes.TRANSITION_ERR);

            router.invokeEventListeners(
              events.TRANSITION_ERROR,
              toState,
              undefined,
              err,
            );
            done(err);

            return () => {};
          },
        );

        router.addEventListener(
          events.TRANSITION_ERROR,
          transitionErrorListener,
        );

        router.start("/users/list", callback);

        // Both callback AND event should be triggered
        expect(callback).toHaveBeenCalledTimes(1);
        expect(transitionErrorListener).toHaveBeenCalledTimes(1);

        // Both should have the same error code
        const [callbackError] = callback.mock.calls[0];
        const eventError = transitionErrorListener.mock.calls[0][2];

        expect(callbackError.code).toBe(errorCodes.TRANSITION_ERR);
        expect(eventError.code).toBe(errorCodes.TRANSITION_ERR);
      });
    });

    describe("TRANSITION_CANCELLED should emit TRANSITION_ERROR", () => {
      it("should emit TRANSITION_ERROR when transition is cancelled", () => {
        const navigateToStateSpy = vi.spyOn(router, "navigateToState");
        const transitionErrorListener = vi.fn();

        navigateToStateSpy.mockImplementationOnce(
          (toState, _fromState, _options, done) => {
            const err = new RouterError(errorCodes.TRANSITION_CANCELLED);

            router.invokeEventListeners(
              events.TRANSITION_ERROR,
              toState,
              undefined,
              err,
            );
            done(err);

            return () => {};
          },
        );

        router.addEventListener(
          events.TRANSITION_ERROR,
          transitionErrorListener,
        );

        router.start("/users/list");

        expect(transitionErrorListener).toHaveBeenCalledTimes(1);

        const error = transitionErrorListener.mock.calls[0][2];

        expect(error.code).toBe(errorCodes.TRANSITION_CANCELLED);
      });
    });

    describe("consistency of TRANSITION_ERROR event parameters", () => {
      it("should have consistent event signature (toState, fromState, error) for ROUTE_NOT_FOUND", () => {
        router.setOption("allowNotFound", false);

        const transitionErrorListener = vi.fn();

        router.addEventListener(
          events.TRANSITION_ERROR,
          transitionErrorListener,
        );

        router.start("/nonexistent/path");

        const args = transitionErrorListener.mock.calls[0];

        expect(args).toHaveLength(3);

        const [toState, fromState, error] = args;

        // ROUTE_NOT_FOUND has no toState (route doesn't exist)
        expect(toState).toBeUndefined();
        expect(fromState).toBeUndefined();
        expect(error).toBeInstanceOf(RouterError);
        expect(error.code).toBe(errorCodes.ROUTE_NOT_FOUND);
      });

      it("should have consistent event signature (toState, fromState, error) for NO_START_PATH_OR_STATE", () => {
        const routerWithoutDefault = createTestRouter({ defaultRoute: "" });
        const transitionErrorListener = vi.fn();

        routerWithoutDefault.addEventListener(
          events.TRANSITION_ERROR,
          transitionErrorListener,
        );

        routerWithoutDefault.start();

        const args = transitionErrorListener.mock.calls[0];

        expect(args).toHaveLength(3);

        const [toState, fromState, error] = args;

        expect(toState).toBeUndefined();
        expect(fromState).toBeUndefined();
        expect(error).toBeInstanceOf(RouterError);
        expect(error.code).toBe(errorCodes.NO_START_PATH_OR_STATE);

        routerWithoutDefault.stop();
      });

      it("should have consistent event signature (toState, fromState, error) for TRANSITION_ERR", () => {
        const navigateToStateSpy = vi.spyOn(router, "navigateToState");
        const transitionErrorListener = vi.fn();

        navigateToStateSpy.mockImplementationOnce(
          (toState, _fromState, _options, done) => {
            const err = new RouterError(errorCodes.TRANSITION_ERR);

            router.invokeEventListeners(
              events.TRANSITION_ERROR,
              toState,
              undefined,
              err,
            );
            done(err);

            return () => {};
          },
        );

        router.addEventListener(
          events.TRANSITION_ERROR,
          transitionErrorListener,
        );

        router.start("/users/list");

        const args = transitionErrorListener.mock.calls[0];

        expect(args).toHaveLength(3);

        const [toState, fromState, error] = args;

        // TRANSITION_ERR has toState (route exists but transition failed)
        expect(toState).toBeDefined();
        expect(toState.name).toBe("users.list");
        expect(fromState).toBeUndefined();
        expect(error).toBeInstanceOf(RouterError);
        expect(error.code).toBe(errorCodes.TRANSITION_ERR);
      });
    });

    describe("no TRANSITION_SUCCESS emission on errors", () => {
      it("should NOT emit TRANSITION_SUCCESS for ROUTE_NOT_FOUND", () => {
        router.setOption("allowNotFound", false);

        const transitionSuccessListener = vi.fn();
        const transitionErrorListener = vi.fn();

        router.addEventListener(
          events.TRANSITION_SUCCESS,
          transitionSuccessListener,
        );
        router.addEventListener(
          events.TRANSITION_ERROR,
          transitionErrorListener,
        );

        router.start("/nonexistent/path");

        expect(transitionSuccessListener).not.toHaveBeenCalled();
        expect(transitionErrorListener).toHaveBeenCalledTimes(1);
      });

      it("should NOT emit TRANSITION_SUCCESS for NO_START_PATH_OR_STATE", () => {
        const routerWithoutDefault = createTestRouter({ defaultRoute: "" });
        const transitionSuccessListener = vi.fn();
        const transitionErrorListener = vi.fn();

        routerWithoutDefault.addEventListener(
          events.TRANSITION_SUCCESS,
          transitionSuccessListener,
        );
        routerWithoutDefault.addEventListener(
          events.TRANSITION_ERROR,
          transitionErrorListener,
        );

        routerWithoutDefault.start();

        expect(transitionSuccessListener).not.toHaveBeenCalled();
        expect(transitionErrorListener).toHaveBeenCalledTimes(1);

        routerWithoutDefault.stop();
      });

      it("should NOT emit TRANSITION_SUCCESS for TRANSITION_ERR", () => {
        const navigateToStateSpy = vi.spyOn(router, "navigateToState");
        const transitionSuccessListener = vi.fn();
        const transitionErrorListener = vi.fn();

        navigateToStateSpy.mockImplementationOnce(
          (toState, _fromState, _options, done) => {
            const err = new RouterError(errorCodes.TRANSITION_ERR);

            router.invokeEventListeners(
              events.TRANSITION_ERROR,
              toState,
              undefined,
              err,
            );
            done(err);

            return () => {};
          },
        );

        router.addEventListener(
          events.TRANSITION_SUCCESS,
          transitionSuccessListener,
        );
        router.addEventListener(
          events.TRANSITION_ERROR,
          transitionErrorListener,
        );

        router.start("/users/list");

        expect(transitionSuccessListener).not.toHaveBeenCalled();
        expect(transitionErrorListener).toHaveBeenCalledTimes(1);
      });
    });
  });
});
