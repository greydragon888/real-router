import {
  describe,
  beforeEach,
  afterEach,
  it,
  expect,
  expectTypeOf,
  vi,
} from "vitest";

import { constants, errorCodes, events, RouterError } from "router6";

import { createTestRouter, omitMeta } from "../../../helpers";

import type { Router, State } from "router6";

let router: Router;
const homeState: State = {
  name: "home",
  params: {},
  path: "/home",
  meta: { id: 5, params: { home: {} }, redirected: false, options: {} },
};

const noop = () => undefined;

describe("router.start() - state object scenarios", () => {
  beforeEach(() => {
    router = createTestRouter();
  });

  afterEach(() => {
    router.stop();
  });

  describe("successful state transition", () => {
    it("should call navigateToState with correct parameters for successful transition", () => {
      const navigateToStateSpy = vi.spyOn(router, "navigateToState");

      const callback = vi.fn();
      const startListener = vi.fn();
      const transitionSuccessListener = vi.fn();

      router.addEventListener(events.ROUTER_START, startListener);
      router.addEventListener(
        events.TRANSITION_SUCCESS,
        transitionSuccessListener,
      );

      const result = router.start("/users/list", callback);

      expect(router.isStarted()).toBe(true);
      expect(startListener).toHaveBeenCalledTimes(1);
      expect(navigateToStateSpy).toHaveBeenCalledTimes(1);
      expect(transitionSuccessListener).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledTimes(1);
      expect(result).toBe(router);

      // Check transitionToState parameters
      const [toState, fromState, options, callbackArg] =
        navigateToStateSpy.mock.calls[0];

      expect(toState).toBeDefined();
      expect(toState.name).toBe("users.list");
      expect(toState.path).toBe("/users/list");
      expect(fromState).toBeUndefined(); // No previous state on start
      // Fix for issue #43: start() should always pass replace: true
      expect(options).toStrictEqual({ replace: true });

      expectTypeOf(callbackArg).toBeFunction();

      // Check callback result
      const [error, state] = callback.mock.calls[0];

      expect(error).toBeUndefined();
      expect(state).toBeDefined();
      expect(omitMeta(state)).toStrictEqual(omitMeta(toState));
    });

    it("should emit TRANSITION_SUCCESS with replace: true option", () => {
      const transitionSuccessListener = vi.fn();

      router.addEventListener(
        events.TRANSITION_SUCCESS,
        transitionSuccessListener,
      );

      router.start("/users/view/123");

      expect(transitionSuccessListener).toHaveBeenCalledTimes(1);

      const [toState, fromState, options] =
        transitionSuccessListener.mock.calls[0];

      expect(toState).toBeDefined();
      expect(toState?.name).toBe("users.view");
      expect(toState?.params).toStrictEqual({ id: "123" });
      expect(fromState).toBeUndefined();
      expect(options).toStrictEqual({ replace: true });
    });

    it("should set router state after successful transition", () => {
      const callback = vi.fn();

      expect(router.getState()).toBeUndefined();

      router.start("/orders/pending", callback);

      const currentState = router.getState();

      expect(currentState).toBeDefined();
      expect(currentState?.name).toBe("orders.pending");
      expect(currentState?.path).toBe("/orders/pending");

      const [error, callbackState] = callback.mock.calls[0];

      expect(error).toBeUndefined();
      expect(omitMeta(currentState)).toStrictEqual(omitMeta(callbackState));
    });

    it("should handle transition with path parameters", () => {
      const transitionSuccessListener = vi.fn();
      const callback = vi.fn();

      router.addEventListener(
        events.TRANSITION_SUCCESS,
        transitionSuccessListener,
      );

      router.start("/users/view/456", callback);

      expect(transitionSuccessListener).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledTimes(1);

      const [toState] = transitionSuccessListener.mock.calls[0];

      expect(toState?.params).toStrictEqual({ id: "456" });

      const [error, callbackState] = callback.mock.calls[0];

      expect(error).toBeUndefined();
      expect(callbackState?.params).toStrictEqual({ id: "456" });

      const currentState = router.getState();

      expect(currentState?.params).toStrictEqual({ id: "456" });
    });
  });

  describe("transition errors (no silent fallback to defaultRoute)", () => {
    it("should report error when transition returns error with redirect (redirect is ignored)", () => {
      const navigateToStateSpy = vi.spyOn(router, "navigateToState");

      // Mock transitionToState to call callback with error containing redirect
      // Redirects are not supported from guards
      // Mock must emit TRANSITION_ERROR like the real navigateToState does
      navigateToStateSpy.mockImplementationOnce(
        (toState, _fromState, _options, done) => {
          const errorWithRedirect = new RouterError(errorCodes.TRANSITION_ERR, {
            redirect: {
              name: "profile",
              params: {},
              path: "/profile",
            },
          });

          // Real navigateToState emits TRANSITION_ERROR
          router.invokeEventListeners(
            events.TRANSITION_ERROR,
            toState,
            undefined,
            errorWithRedirect,
          );
          done(errorWithRedirect);

          return noop;
        },
      );

      const callback = vi.fn();
      const startListener = vi.fn();
      const transitionErrorListener = vi.fn();

      router.addEventListener(events.ROUTER_START, startListener);
      router.addEventListener(events.TRANSITION_ERROR, transitionErrorListener);

      const result = router.start("/users/list", callback);

      // Issue #50: Router is NOT started (two-phase start)
      expect(router.isStarted()).toBe(false);
      expect(startListener).not.toHaveBeenCalled();
      expect(result).toBe(router);

      // Issue #44: Error should be reported, not silently fallback to defaultRoute
      expect(transitionErrorListener).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledTimes(1);

      const [error, state] = callback.mock.calls[0];

      expect(error).toBeDefined();
      expect(error.code).toBe(errorCodes.TRANSITION_ERR);
      expect(state).toBeUndefined();

      // Router state should remain undefined (no fallback)
      expect(router.getState()).toBeUndefined();
    });

    it("should call callback with error (not fallback to defaultRoute)", () => {
      const navigateToStateSpy = vi.spyOn(router, "navigateToState");

      // Mock first call to return error
      // Mock must emit TRANSITION_ERROR like the real navigateToState does
      navigateToStateSpy.mockImplementationOnce(
        (toState, _fromState, _options, done) => {
          const err = new RouterError(errorCodes.TRANSITION_ERR, {
            message: "Transition failed",
          });

          router.invokeEventListeners(
            events.TRANSITION_ERROR,
            toState,
            undefined,
            err,
          );
          done(err);

          return noop;
        },
      );

      const callback = vi.fn();

      router.start("/users/list", callback);

      // Issue #44: Callback should be called with error, not fallback state
      expect(callback).toHaveBeenCalledTimes(1);

      const [error, state] = callback.mock.calls[0];

      expect(error).toBeDefined();
      expect(error.code).toBe(errorCodes.TRANSITION_ERR);
      expect(state).toBeUndefined();
    });

    it("should emit TRANSITION_ERROR on transition error (not TRANSITION_SUCCESS)", () => {
      const navigateToStateSpy = vi.spyOn(router, "navigateToState");

      // Mock must emit TRANSITION_ERROR like the real navigateToState does
      navigateToStateSpy.mockImplementationOnce(
        (toState, _fromState, _options, done) => {
          const err = new RouterError(errorCodes.TRANSITION_ERR, {
            message: "Transition failed",
          });

          router.invokeEventListeners(
            events.TRANSITION_ERROR,
            toState,
            undefined,
            err,
          );
          done(err);

          return noop;
        },
      );

      const transitionSuccessListener = vi.fn();
      const transitionErrorListener = vi.fn();

      router.addEventListener(
        events.TRANSITION_SUCCESS,
        transitionSuccessListener,
      );
      router.addEventListener(events.TRANSITION_ERROR, transitionErrorListener);

      router.start("/users/list");

      // Issue #44: Should emit TRANSITION_ERROR, not TRANSITION_SUCCESS
      expect(transitionErrorListener).toHaveBeenCalledTimes(1);
      expect(transitionSuccessListener).not.toHaveBeenCalled();

      // Router state should remain undefined (no fallback)
      expect(router.getState()).toBeUndefined();
    });
  });

  describe("router start with state object", () => {
    describe("meta data handling", () => {
      it("should assign new meta id on transitions after starting with explicit state", () => {
        router.start(homeState);

        expect(router.getState()?.meta?.id).toStrictEqual(homeState.meta?.id);

        router.navigate("users");

        expect(router.getState()?.meta?.id).toStrictEqual(1);

        router.navigate("profile");

        expect(router.getState()?.meta?.id).not.toStrictEqual(1);
        expect(router.getState()?.meta?.id).not.toStrictEqual(
          homeState.meta?.id,
        );
      });
    });

    describe("valid state object with direct setState", () => {
      it("should successfully initialize router with valid state object", () => {
        const startState = {
          name: "users.view",
          params: { id: "123" },
          path: "/users/view/123",
        };
        const callback = vi.fn();

        const result = router.start(startState, callback);

        // Router should initialize and return itself
        expect(result).toBe(router);
        expect(router.isStarted()).toBe(true);
      });

      it("should call callback without error with provided state", () => {
        const startState = {
          name: "users.list",
          params: {},
          path: "/users/list",
        };
        const callback = vi.fn();

        router.start(startState, callback);

        // Callback should be called exactly once without error
        expect(callback).toHaveBeenCalledExactlyOnceWith(undefined, startState);
      });

      it("should set router state to provided state object", () => {
        const startState = {
          name: "orders.view",
          params: { id: "456" },
          path: "/orders/view/456",
        };
        const callback = vi.fn();

        router.start(startState, callback);

        // Router state should match the provided object
        expect(router.getState()).toStrictEqual(startState);
      });

      it("should process state through transition pipeline including middleware", () => {
        const startState = {
          name: "settings.account",
          params: {},
          path: "/settings/account",
        };

        // add middleware to check that pipeline works
        const middlewareSpy = vi.fn();

        router.useMiddleware(() => (toState, _fromState, done) => {
          middlewareSpy(toState.name);
          done(); // allow the transition
        });

        const callback = vi.fn();

        router.start(startState, callback);

        // Middleware should be called
        expect(middlewareSpy).toHaveBeenCalledExactlyOnceWith(
          "settings.account",
        );

        // And the state should be established
        expect(callback).toHaveBeenCalledWith(undefined, startState);
      });

      it("should emit proper transition events for state objects", () => {
        const startState = {
          name: "profile.me",
          params: {},
          path: "/profile/",
        };

        const routerStartSpy = vi.fn();
        const transitionStartSpy = vi.fn();
        const transitionSuccessSpy = vi.fn();

        router.addEventListener(events.ROUTER_START, routerStartSpy);
        router.addEventListener(events.TRANSITION_START, transitionStartSpy);
        router.addEventListener(
          events.TRANSITION_SUCCESS,
          transitionSuccessSpy,
        );

        router.start(startState);

        // All events should be emitted
        expect(routerStartSpy).toHaveBeenCalledTimes(1);
        expect(transitionStartSpy).toHaveBeenCalledTimes(1);
        expect(transitionSuccessSpy).toHaveBeenCalledTimes(1);
      });
    });

    describe("invalid state object initialization attempt", () => {
      // Fix for issue #42: now returns ROUTE_NOT_FOUND error instead of throwing
      // https://github.com/greydragon888/router6/issues/42
      it("should return ROUTE_NOT_FOUND error for non-existent route name", () => {
        router.setOption("allowNotFound", false);

        const invalidState = {
          name: "nonexistent.route",
          params: {},
          path: "/nonexistent",
        };
        const callback = vi.fn();

        router.start(invalidState, callback);

        // Router should not be started
        expect(router.isStarted()).toBe(false);

        // Callback should be called with ROUTE_NOT_FOUND error
        expect(callback).toHaveBeenCalledTimes(1);

        const [error, state] = callback.mock.calls[0];

        expect(error).toBeDefined();
        expect(error.code).toBe(errorCodes.ROUTE_NOT_FOUND);
        expect(state).toBeUndefined();

        // Router state should remain undefined
        expect(router.getState()).toBeUndefined();
      });

      // Fix for issue #42: now returns ROUTE_NOT_FOUND error instead of throwing
      // https://github.com/greydragon888/router6/issues/42
      it("should return ROUTE_NOT_FOUND error for completely invalid route name", () => {
        router.setOption("allowNotFound", false);

        const invalidState = {
          name: "totally.invalid.route",
          params: {},
          path: "/invalid",
        };

        const callback = vi.fn();

        router.start(invalidState, callback);

        expect(router.isStarted()).toBe(false);
        expect(callback).toHaveBeenCalledTimes(1);

        const [error, state] = callback.mock.calls[0];

        expect(error).toBeDefined();
        expect(error.code).toBe(errorCodes.ROUTE_NOT_FOUND);
        expect(state).toBeUndefined();

        expect(router.getState()).toBeUndefined();
      });

      it("should handle empty route name in state object", () => {
        router.setOption("allowNotFound", false);

        const invalidState = {
          name: "", // Empty route name
          params: {},
          path: "/empty",
        };
        const callback = vi.fn();

        router.start(invalidState, callback);

        expect(router.isStarted()).toBe(false);
        expect(callback).toHaveBeenCalled();

        const [error] = callback.mock.calls[0];

        expect(error).toBeDefined();
        expect(error.code).toBe(errorCodes.ROUTE_NOT_FOUND);

        expect(router.getState()).toBeUndefined();
      });

      it("should handle missing route name in state object", () => {
        router.setOption("allowNotFound", false);

        const invalidState = {
          // Missing name property entirely
          params: {},
          path: "/missing-name",
        };
        const callback = vi.fn();

        // @ts-expect-error: Intentionally testing invalid structure
        router.start(invalidState, callback);

        expect(router.isStarted()).toBe(false);
        expect(callback).toHaveBeenCalled();

        const [error] = callback.mock.calls[0];

        expect(error).toBeDefined();
        expect(error.code).toBe(errorCodes.ROUTE_NOT_FOUND);

        expect(router.getState()).toBeUndefined();
      });

      // Fix for issue #42: now returns ROUTE_NOT_FOUND error instead of throwing
      // https://github.com/greydragon888/router6/issues/42
      it("should return ROUTE_NOT_FOUND error when params have invalid type", () => {
        router.setOption("allowNotFound", false);

        const invalidState = {
          name: "users.view", // Valid route
          params: "invalid-params", // Should be object, not string
          path: "/users/view/123",
        };
        const callback = vi.fn();

        // @ts-expect-error: Intentionally testing invalid types
        router.start(invalidState, callback);

        expect(router.isStarted()).toBe(false);
        expect(callback).toHaveBeenCalledTimes(1);

        const [error, state] = callback.mock.calls[0];

        expect(error).toBeDefined();
        expect(error.code).toBe(errorCodes.ROUTE_NOT_FOUND);
        expect(state).toBeUndefined();

        expect(router.getState()).toBeUndefined();
      });

      it("should work normally for UNKNOWN_ROUTE special case", () => {
        const unknownState = {
          name: constants.UNKNOWN_ROUTE,
          params: { path: "/custom/unknown/path" },
          path: "/custom/unknown/path",
        };
        const callback = vi.fn();

        // UNKNOWN_ROUTE has special handling in buildPath - should not throw
        expect(() => {
          router.start(unknownState, callback);
        }).not.toThrowError();

        expect(callback).toHaveBeenCalledTimes(1);
        expect(router.isStarted()).toBe(true);

        const [error, state] = callback.mock.calls[0];

        expect(error).toBeUndefined();
        expect(state).toBeDefined();
      });

      it("should work normally for valid state objects", () => {
        const validState = {
          name: "users.view",
          params: { id: "123" },
          path: "/users/view/123",
        };
        const callback = vi.fn();

        // Valid state should not throw and work normally
        expect(() => {
          router.start(validState, callback);
        }).not.toThrowError();

        expect(callback).toHaveBeenCalledTimes(1);

        const [error, state] = callback.mock.calls[0];

        expect(error).toBeUndefined();
        expect(state?.name).toBe("users.view");
        expect(state?.params).toStrictEqual({ id: "123" });
        expect(router.isStarted()).toBe(true);
        expect(router.getState()?.name).toBe("users.view");
      });

      it("should work for valid routes with complex params", () => {
        const validState = {
          name: "orders.view",
          params: { id: "456", filter: "pending" },
          path: "/orders/view/456",
        };
        const callback = vi.fn();

        expect(() => {
          router.start(validState, callback);
        }).not.toThrowError();

        expect(callback).toHaveBeenCalledTimes(1);

        const [error, state] = callback.mock.calls[0];

        expect(error).toBeUndefined();
        expect(state?.name).toBe("orders.view");
        expect(state?.params).toStrictEqual({
          id: "456",
          filter: "pending",
        });
        expect(router.getState()?.name).toBe("orders.view");
        expect(router.isStarted()).toBe(true);
      });
    });

    describe("success and error events", () => {
      it("should emit TRANSITION_SUCCESS event on successful path start", () => {
        const validPath = "/users/list";

        const transitionSuccessListener = vi.fn();

        router.addEventListener(
          events.TRANSITION_SUCCESS,
          transitionSuccessListener,
        );

        router.start(validPath);

        // TRANSITION_SUCCESS should be emitted exactly once
        expect(transitionSuccessListener).toHaveBeenCalledTimes(1);
      });

      it("should pass correct toState in TRANSITION_SUCCESS event", () => {
        const validPath = "/users/view/123";

        const transitionSuccessListener = vi.fn();

        router.addEventListener(
          events.TRANSITION_SUCCESS,
          transitionSuccessListener,
        );

        router.start(validPath);

        const [toState] = transitionSuccessListener.mock.calls[0];

        // toState should contain correct route information
        expect(toState).toBeDefined();
        expect(toState.name).toBe("users.view");
        expect(toState.path).toBe("/users/view/123");
        expect(toState.params).toStrictEqual({ id: "123" });
      });

      it("should pass undefined as fromState in TRANSITION_SUCCESS event", () => {
        const validPath = "/orders/pending";

        const transitionSuccessListener = vi.fn();

        router.addEventListener(
          events.TRANSITION_SUCCESS,
          transitionSuccessListener,
        );

        router.start(validPath);

        const [, fromState] = transitionSuccessListener.mock.calls[0];

        // fromState should be undefined (no previous state)
        expect(fromState).toBeUndefined();
      });

      it("should pass replace:true options in TRANSITION_SUCCESS event", () => {
        const validPath = "/settings/account";

        const transitionSuccessListener = vi.fn();

        router.addEventListener(
          events.TRANSITION_SUCCESS,
          transitionSuccessListener,
        );

        router.start(validPath);

        const options = transitionSuccessListener.mock.calls[0][2];

        // options should contain replace: true
        expect(options).toStrictEqual({ replace: true });
      });

      it("should emit TRANSITION_SUCCESS for state object start", () => {
        const startState = {
          name: "profile.me",
          params: {},
          path: "/profile/",
        };

        const transitionSuccessListener = vi.fn();

        router.addEventListener(
          events.TRANSITION_SUCCESS,
          transitionSuccessListener,
        );

        router.start(startState);

        // Should emit TRANSITION_SUCCESS for state objects too
        expect(transitionSuccessListener).toHaveBeenCalledTimes(1);

        const [toState, fromState, options] =
          transitionSuccessListener.mock.calls[0];

        expect(toState).toStrictEqual(startState);
        expect(fromState).toBeUndefined();
        expect(options).toStrictEqual({ replace: true });
      });

      it("should emit TRANSITION_SUCCESS with callback provided", () => {
        const validPath = "/home";
        const callback = vi.fn();

        const transitionSuccessListener = vi.fn();

        router.addEventListener(
          events.TRANSITION_SUCCESS,
          transitionSuccessListener,
        );

        router.start(validPath, callback);

        // Event should be emitted even when callback is provided
        expect(transitionSuccessListener).toHaveBeenCalledTimes(1);
        expect(callback).toHaveBeenCalledTimes(1);

        // Both should receive the same state
        const [eventToState] = transitionSuccessListener.mock.calls[0];
        const [, callbackState] = callback.mock.calls[0];

        expect(eventToState).toStrictEqual(callbackState);
      });
    });

    describe("emit TRANSITION_ERROR on router start error", () => {
      it("should emit TRANSITION_ERROR with correct event structure", () => {
        const validPath = "/orders/view/456";

        // Add middleware that blocks transition
        router.useMiddleware(() => (toState) => {
          return toState.name !== "orders.view";
        });

        const transitionErrorListener = vi.fn();

        router.addEventListener(
          events.TRANSITION_ERROR,
          transitionErrorListener,
        );

        router.start(validPath);

        // Event should be emitted exactly once
        expect(transitionErrorListener).toHaveBeenCalledTimes(1);

        const [toState, fromState, error] =
          transitionErrorListener.mock.calls[0];

        // toState should contain the target state that failed
        expect(toState).toBeDefined();
        expect(toState.name).toBe("orders.view");
        expect(toState.path).toBe("/orders/view/456");
        expect(toState.params).toStrictEqual({ id: "456" });

        // fromState should be undefined (no previous state)
        expect(fromState).toBeUndefined();

        // Error should be RouterError instance
        expect(error).toBeDefined();
        expect(error).toBeInstanceOf(Error); // RouterError extends Error
      });

      it("should emit TRANSITION_ERROR when Promise rejects", () => {
        const validPath = "/users/view/789";

        // Add middleware that returns rejected Promise

        router.useMiddleware(() => (toState) => {
          if (toState.name === "users.view") {
            return Promise.reject({ message: "Async access denied" });
          }

          return true;
        });

        const transitionErrorListener = vi.fn();

        router.addEventListener(
          events.TRANSITION_ERROR,
          transitionErrorListener,
        );

        router.start(validPath, (error, state) => {
          // Should emit TRANSITION_ERROR for rejected promises
          expect(transitionErrorListener).toHaveBeenCalledTimes(1);

          // Check the event data (users.view), not callback data (home)
          const [toState, fromState, eventError] =
            transitionErrorListener.mock.calls[0];

          expect(toState.name).toBe("users.view");
          expect(fromState).toBeUndefined();
          expect(eventError).toBeDefined();

          // Callback shows final successful state (home)
          expect(error).toBeUndefined();
          expect(state?.name).toBe("home");
        });
      });

      it("should emit TRANSITION_ERROR but callback succeeds after fallback", () => {
        const validPath = "/settings/general";

        // Add middleware that blocks specific transition
        router.useMiddleware(() => (toState) => {
          return toState.name !== "settings.general";
        });

        const transitionErrorListener = vi.fn();

        router.addEventListener(
          events.TRANSITION_ERROR,
          transitionErrorListener,
        );

        router.start(validPath, (error, state) => {
          // Issue #44: Error should be reported to callback (no silent fallback)
          expect(transitionErrorListener).toHaveBeenCalledTimes(1);

          const [blockedToState, , eventError] =
            transitionErrorListener.mock.calls[0];

          expect(blockedToState.name).toBe("settings.general");
          expect(eventError).toBeDefined();

          // Callback receives the error (no silent fallback)
          expect(error).toBeDefined();
          expect(state).toBeUndefined();
        });
      });

      // Issue #44: No silent fallback - only TRANSITION_ERROR is emitted
      it("should emit only TRANSITION_ERROR when transition is blocked (no fallback)", () => {
        const validPath = "/orders/completed";

        // Add middleware that blocks specific transition
        router.useMiddleware(() => (toState) => {
          return toState.name !== "orders.completed";
        });

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

        router.start(validPath);

        // TRANSITION_ERROR should be emitted for blocked route
        expect(transitionErrorListener).toHaveBeenCalledTimes(1);

        // No TRANSITION_SUCCESS - no silent fallback (issue #44)
        expect(transitionSuccessListener).not.toHaveBeenCalled();

        // Check error event
        const errorToState = transitionErrorListener.mock.calls[0][0];

        expect(errorToState.name).toBe("orders.completed");
      });

      // Issue #44: No silent fallback - router state remains undefined
      it("should not silently fallback when primary transition fails", () => {
        const validPath = "/items/123";

        // Add middleware that blocks specific transition
        router.useMiddleware(() => (toState) => {
          return toState.name !== "items"; // Block only 'items'
        });

        const transitionErrorListener = vi.fn();

        router.addEventListener(
          events.TRANSITION_ERROR,
          transitionErrorListener,
        );

        router.start(validPath);

        // Error should be emitted for blocked route
        expect(transitionErrorListener).toHaveBeenCalledTimes(1);

        const [blockedState] = transitionErrorListener.mock.calls[0];

        expect(blockedState.name).toBe("items");

        // Issue #44: Router state should be undefined (no silent fallback)
        expect(router.getState()).toBeUndefined();
      });

      it("should emit TRANSITION_ERROR for blocked state object transitions", () => {
        const startState = {
          name: "users.view",
          params: { id: "999" },
          path: "/users/view/999",
        };

        // Add middleware that blocks specific routes
        router.useMiddleware(() => (toState) => {
          return toState.name !== "users.view";
        });

        const transitionErrorListener = vi.fn();

        router.addEventListener(
          events.TRANSITION_ERROR,
          transitionErrorListener,
        );

        router.start(startState);

        // Should emit TRANSITION_ERROR for blocked state objects
        expect(transitionErrorListener).toHaveBeenCalledTimes(1);

        const [toState, fromState, error] =
          transitionErrorListener.mock.calls[0];

        expect(toState).toStrictEqual(startState);
        expect(fromState).toBeUndefined();
        expect(error).toBeDefined();
      });

      it("should handle Promise rejection with custom error data", () => {
        router.setOption("allowNotFound", false);

        const validPath = "/profile/user/123";

        // Add middleware that returns rejected Promise with custom data
        router.useMiddleware(
          () => () =>
            Promise.reject({
              message: "Custom async error",
              errorType: "PERMISSION_DENIED",
              userId: "123",
            }),
        );

        const transitionErrorListener = vi.fn();

        router.addEventListener(
          events.TRANSITION_ERROR,
          transitionErrorListener,
        );

        router.start(validPath, () => {
          // Should emit TRANSITION_ERROR with custom error data
          expect(transitionErrorListener).toHaveBeenCalledTimes(1);

          const error = transitionErrorListener.mock.calls[0][2];

          expect(error).toBeDefined();
          expect(error).toBeInstanceOf(Error); // RouterError
        });
      });
    });
  });

  describe("router start return value", () => {
    it("should return router instance for state object input", () => {
      const stateObject = {
        name: "settings.general",
        params: {},
        path: "/settings/general",
      };

      const result = router.start(stateObject);

      // Should return router instance for state objects
      expect(result).toBe(router);
      expect(router.getState()?.name).toBe("settings.general");
    });
  });

  describe("Issue #42: router.start() should validate state objects when allowNotFound is false", () => {
    describe("invalid state object with allowNotFound = false", () => {
      beforeEach(() => {
        router.setOption("allowNotFound", false);
      });

      it("should return ROUTE_NOT_FOUND error for invalid state object", () => {
        const invalidState = {
          name: "nonexistent.route",
          params: {},
          path: "/nonexistent",
        };
        const callback = vi.fn();

        router.start(invalidState, callback);

        expect(callback).toHaveBeenCalledTimes(1);

        const [error, state] = callback.mock.calls[0];

        expect(error).toBeDefined();
        expect(error.code).toBe(errorCodes.ROUTE_NOT_FOUND);
        expect(state).toBeUndefined();
      });

      it("should not start router when invalid state object is provided", () => {
        const invalidState = {
          name: "nonexistent.route",
          params: {},
          path: "/nonexistent",
        };
        const startListener = vi.fn();

        router.addEventListener(events.ROUTER_START, startListener);

        router.start(invalidState);

        expect(router.isStarted()).toBe(false);
        expect(startListener).not.toHaveBeenCalled();
      });

      it("should emit TRANSITION_ERROR event for invalid state object", () => {
        const invalidState = {
          name: "nonexistent.route",
          params: {},
          path: "/nonexistent",
        };
        const transitionErrorListener = vi.fn();

        router.addEventListener(
          events.TRANSITION_ERROR,
          transitionErrorListener,
        );

        router.start(invalidState);

        expect(transitionErrorListener).toHaveBeenCalledTimes(1);

        const [toState, fromState, error] =
          transitionErrorListener.mock.calls[0];

        expect(toState).toBeUndefined();
        expect(fromState).toBeUndefined();
        expect(error).toBeDefined();
        expect(error.code).toBe(errorCodes.ROUTE_NOT_FOUND);
      });

      it("should keep router state undefined after failed validation", () => {
        const invalidState = {
          name: "nonexistent.route",
          params: {},
          path: "/nonexistent",
        };

        router.start(invalidState);

        expect(router.getState()).toBeUndefined();
      });

      it("should not emit TRANSITION_SUCCESS for invalid state object", () => {
        const invalidState = {
          name: "nonexistent.route",
          params: {},
          path: "/nonexistent",
        };
        const transitionSuccessListener = vi.fn();

        router.addEventListener(
          events.TRANSITION_SUCCESS,
          transitionSuccessListener,
        );

        router.start(invalidState);

        expect(transitionSuccessListener).not.toHaveBeenCalled();
      });

      it("should handle deeply nested invalid route names", () => {
        const invalidState = {
          name: "deeply.nested.invalid.route.name",
          params: {},
          path: "/deeply/nested/invalid",
        };
        const callback = vi.fn();

        router.start(invalidState, callback);

        expect(callback).toHaveBeenCalledTimes(1);

        const [error] = callback.mock.calls[0];

        expect(error).toBeDefined();
        expect(error.code).toBe(errorCodes.ROUTE_NOT_FOUND);
      });
    });

    describe("invalid state object with allowNotFound = true", () => {
      beforeEach(() => {
        router.setOption("allowNotFound", true);
      });

      it("should accept invalid state object when allowNotFound is true", () => {
        const invalidState = {
          name: "nonexistent.route",
          params: {},
          path: "/nonexistent",
        };
        const callback = vi.fn();

        router.start(invalidState, callback);

        expect(callback).toHaveBeenCalledTimes(1);

        const [error, state] = callback.mock.calls[0];

        expect(error).toBeUndefined();
        expect(state).toBeDefined();
      });

      it("should start router when allowNotFound is true", () => {
        const invalidState = {
          name: "nonexistent.route",
          params: {},
          path: "/nonexistent",
        };
        const startListener = vi.fn();

        router.addEventListener(events.ROUTER_START, startListener);

        router.start(invalidState);

        expect(router.isStarted()).toBe(true);
        expect(startListener).toHaveBeenCalledTimes(1);
      });
    });

    describe("valid state object should work normally", () => {
      it("should accept valid state object", () => {
        const validState = {
          name: "users.list",
          params: {},
          path: "/users/list",
        };
        const callback = vi.fn();

        router.start(validState, callback);

        expect(callback).toHaveBeenCalledTimes(1);

        const [error, state] = callback.mock.calls[0];

        expect(error).toBeUndefined();
        expect(state).toBeDefined();
        expect(state?.name).toBe("users.list");
      });

      it("should start router with valid state object", () => {
        const validState = {
          name: "users.view",
          params: { id: "123" },
          path: "/users/view/123",
        };
        const startListener = vi.fn();

        router.addEventListener(events.ROUTER_START, startListener);

        router.start(validState);

        expect(router.isStarted()).toBe(true);
        expect(startListener).toHaveBeenCalledTimes(1);
      });
    });

    describe("consistency between string paths and state objects", () => {
      beforeEach(() => {
        router.setOption("allowNotFound", false);
      });

      it("should handle invalid path string the same as invalid state object", () => {
        const pathCallback = vi.fn();
        const stateCallback = vi.fn();

        // First router with invalid path
        const router1 = createTestRouter();

        router1.setOption("allowNotFound", false);
        router1.start("/nonexistent/path", pathCallback);

        // Second router with invalid state object
        const router2 = createTestRouter();

        router2.setOption("allowNotFound", false);
        router2.start(
          { name: "nonexistent.route", params: {}, path: "/nonexistent" },
          stateCallback,
        );

        // Both should return ROUTE_NOT_FOUND error
        expect(pathCallback).toHaveBeenCalledTimes(1);
        expect(stateCallback).toHaveBeenCalledTimes(1);

        const [pathError] = pathCallback.mock.calls[0];
        const [stateError] = stateCallback.mock.calls[0];

        expect(pathError.code).toBe(errorCodes.ROUTE_NOT_FOUND);
        expect(stateError.code).toBe(errorCodes.ROUTE_NOT_FOUND);

        // Both routers should not be started
        expect(router1.isStarted()).toBe(false);
        expect(router2.isStarted()).toBe(false);

        router1.stop();
        router2.stop();
      });
    });
  });

  describe("Issue #43: router.start() should pass replace: true option to navigateToState", () => {
    describe("start with path string", () => {
      it("should pass replace: true option to navigateToState", () => {
        const navigateToStateSpy = vi.spyOn(router, "navigateToState");

        router.start("/users/list");

        expect(navigateToStateSpy).toHaveBeenCalledTimes(1);

        const options = navigateToStateSpy.mock.calls[0][2];

        expect(options).toStrictEqual({ replace: true });
      });

      it("should pass replace: true for path with params", () => {
        const navigateToStateSpy = vi.spyOn(router, "navigateToState");

        router.start("/users/view/123");

        expect(navigateToStateSpy).toHaveBeenCalledTimes(1);

        const [toState, fromState, options] = navigateToStateSpy.mock.calls[0];

        expect(toState.name).toBe("users.view");
        expect(toState.params).toStrictEqual({ id: "123" });
        expect(fromState).toBeUndefined();
        expect(options).toStrictEqual({ replace: true });
      });

      it("should pass replace: true for path with query parameters", () => {
        const navigateToStateSpy = vi.spyOn(router, "navigateToState");

        router.start("/users/list?page=2");

        expect(navigateToStateSpy).toHaveBeenCalledTimes(1);

        const options = navigateToStateSpy.mock.calls[0][2];

        expect(options).toStrictEqual({ replace: true });
      });
    });

    describe("start with state object", () => {
      it("should pass replace: true option when starting with state object", () => {
        const navigateToStateSpy = vi.spyOn(router, "navigateToState");
        const validState = {
          name: "users.list",
          params: {},
          path: "/users/list",
        };

        router.start(validState);

        expect(navigateToStateSpy).toHaveBeenCalledTimes(1);

        const options = navigateToStateSpy.mock.calls[0][2];

        expect(options).toStrictEqual({ replace: true });
      });

      it("should pass replace: true for state object with params", () => {
        const navigateToStateSpy = vi.spyOn(router, "navigateToState");
        const validState = {
          name: "users.view",
          params: { id: "456" },
          path: "/users/view/456",
        };

        router.start(validState);

        expect(navigateToStateSpy).toHaveBeenCalledTimes(1);

        const [toState, fromState, options] = navigateToStateSpy.mock.calls[0];

        expect(toState.name).toBe("users.view");
        expect(toState.params).toStrictEqual({ id: "456" });
        expect(fromState).toBeUndefined();
        expect(options).toStrictEqual({ replace: true });
      });
    });

    describe("start with allowNotFound = true", () => {
      beforeEach(() => {
        router.setOption("allowNotFound", true);
      });

      it("should pass replace: true for unknown route when allowNotFound is true", () => {
        const navigateToStateSpy = vi.spyOn(router, "navigateToState");

        router.start("/unknown/path");

        expect(navigateToStateSpy).toHaveBeenCalledTimes(1);

        const options = navigateToStateSpy.mock.calls[0][2];

        expect(options).toStrictEqual({ replace: true });
      });
    });

    describe("consistency of replace option across all start scenarios", () => {
      it("should use replace: true in TRANSITION_SUCCESS event", () => {
        const transitionSuccessListener = vi.fn();

        router.addEventListener(
          events.TRANSITION_SUCCESS,
          transitionSuccessListener,
        );

        router.start("/users/list");

        expect(transitionSuccessListener).toHaveBeenCalledTimes(1);

        const options = transitionSuccessListener.mock.calls[0][2];

        expect(options).toStrictEqual({ replace: true });
      });

      it("should have consistent replace: true between navigateToState and event", () => {
        const navigateToStateSpy = vi.spyOn(router, "navigateToState");
        const transitionSuccessListener = vi.fn();

        router.addEventListener(
          events.TRANSITION_SUCCESS,
          transitionSuccessListener,
        );

        router.start("/users/list");

        const navOptions = navigateToStateSpy.mock.calls[0][2];
        const eventOptions = transitionSuccessListener.mock.calls[0][2];

        expect(navOptions).toStrictEqual({ replace: true });
        expect(eventOptions).toStrictEqual({ replace: true });
        expect(navOptions).toStrictEqual(eventOptions);
      });
    });
  });
});
