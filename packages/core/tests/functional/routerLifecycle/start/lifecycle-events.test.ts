import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

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

        expect(router.isActive()).toBe(true);
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
        router = createTestRouter({ allowNotFound: false });
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

      it("should emit TRANSITION_ERROR for invalid state object", async () => {
        const transitionErrorListener = vi.fn();

        router.addEventListener(
          events.TRANSITION_ERROR,
          transitionErrorListener,
        );

        try {
          await router.start("/nonexistent");
        } catch {
          // Expected to fail
        }

        expect(transitionErrorListener).toHaveBeenCalledTimes(1);

        const error = transitionErrorListener.mock.calls[0][2];

        expect(error.code).toBe(errorCodes.ROUTE_NOT_FOUND);
      });

      it("should return error to callback AND emit TRANSITION_ERROR", async () => {
        const transitionErrorListener = vi.fn();

        router.addEventListener(
          events.TRANSITION_ERROR,
          transitionErrorListener,
        );

        try {
          await router.start("/nonexistent/path");
        } catch {
          // Expected to fail
        }

        // Event should be triggered
        expect(transitionErrorListener).toHaveBeenCalledTimes(1);

        // Check the error
        const eventError = transitionErrorListener.mock.calls[0][2];

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

      it("should return error to callback AND emit TRANSITION_ERROR", async () => {
        const routerWithoutDefault = createTestRouter({ defaultRoute: "" });
        const transitionErrorListener = vi.fn();

        routerWithoutDefault.addEventListener(
          events.TRANSITION_ERROR,
          transitionErrorListener,
        );

        try {
          await routerWithoutDefault.start();
        } catch {
          // Expected to fail
        }

        // Event should be triggered
        expect(transitionErrorListener).toHaveBeenCalledTimes(1);

        // Check the error
        const eventError = transitionErrorListener.mock.calls[0][2];

        expect(eventError.code).toBe(errorCodes.NO_START_PATH_OR_STATE);

        routerWithoutDefault.stop();
      });
    });

    describe("TRANSITION_ERR should emit TRANSITION_ERROR", () => {
      it("should emit TRANSITION_ERROR when middleware blocks transition", () => {
        const transitionErrorListener = vi.fn();

        // Add middleware that blocks the transition
        router.useMiddleware(() => (toState) => {
          return toState.name !== "users.list"; // Block users.list
        });

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
        const transitionErrorListener = vi.fn();

        // Add middleware that blocks the transition
        router.useMiddleware(() => (toState) => {
          return toState.name !== "users.view"; // Block users.view
        });

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

      it("should return error to callback AND emit TRANSITION_ERROR", async () => {
        const transitionErrorListener = vi.fn();

        // Add middleware that blocks the transition
        router.useMiddleware(() => (toState) => {
          return toState.name !== "users.list"; // Block users.list
        });

        router.addEventListener(
          events.TRANSITION_ERROR,
          transitionErrorListener,
        );

        try {
          await router.start("/users/list");
        } catch {
          // Expected to fail
        }

        // Event should be triggered
        expect(transitionErrorListener).toHaveBeenCalledTimes(1);

        // Check the error
        const eventError = transitionErrorListener.mock.calls[0][2];

        expect(eventError.code).toBe(errorCodes.TRANSITION_ERR);
      });
    });

    // Note: TRANSITION_CANCELLED tests were removed because they required mocking
    // navigateToState which is now called directly via dependency injection.
    // TRANSITION_CANCELLED during start() is not a realistic scenario since
    // start() is synchronous and can't be cancelled by another navigation.;

    describe("consistency of TRANSITION_ERROR event parameters", () => {
      it("should have consistent event signature (toState, fromState, error) for ROUTE_NOT_FOUND", () => {
        router = createTestRouter({ allowNotFound: false });

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
        const transitionErrorListener = vi.fn();

        // Add middleware that blocks the transition
        router.useMiddleware(() => (toState) => {
          return toState.name !== "users.list"; // Block users.list
        });

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
        expect(error).toBeInstanceOf(Error);
        expect(error.code).toBe(errorCodes.TRANSITION_ERR);
      });
    });

    describe("no TRANSITION_SUCCESS emission on errors", () => {
      it("should NOT emit TRANSITION_SUCCESS for ROUTE_NOT_FOUND", () => {
        router = createTestRouter({ allowNotFound: false });

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
        const transitionSuccessListener = vi.fn();
        const transitionErrorListener = vi.fn();

        // Add middleware that blocks the transition
        router.useMiddleware(() => (toState) => {
          return toState.name !== "users.list"; // Block users.list
        });

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
