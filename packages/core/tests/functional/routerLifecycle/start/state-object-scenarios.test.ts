import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { constants, errorCodes, events } from "@real-router/core";

import { createTestRouter, omitMeta } from "../../../helpers";

import type { Router, State } from "@real-router/core";

let router: Router;
const homeState: State = {
  name: "home",
  params: {},
  path: "/home",
  meta: { id: 5, params: { home: {} }, redirected: false, options: {} },
};

describe("router.start() - state object scenarios", () => {
  beforeEach(() => {
    router = createTestRouter();
  });

  afterEach(() => {
    router.stop();
  });

  describe("successful state transition", () => {
    it("should start router and transition successfully", async () => {
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

      // Verify state matches current router state
      const currentState = router.getState();

      expect(omitMeta(currentState)).toStrictEqual(omitMeta(state));
    });

    it("should emit TRANSITION_SUCCESS with replace: true option", async () => {
      const transitionSuccessListener = vi.fn();

      router.addEventListener(
        events.TRANSITION_SUCCESS,
        transitionSuccessListener,
      );

      await router.start("/users/view/123");

      expect(transitionSuccessListener).toHaveBeenCalledTimes(1);

      const [toState, fromState, options] =
        transitionSuccessListener.mock.calls[0];

      expect(toState).toBeDefined();
      expect(toState?.name).toBe("users.view");
      expect(toState?.params).toStrictEqual({ id: "123" });
      expect(fromState).toBeUndefined();
      expect(options).toStrictEqual({ replace: true });
    });

    it("should set router state after successful transition", async () => {
      expect(router.getState()).toBeUndefined();

      const state = await router.start("/orders/pending");

      const currentState = router.getState();

      expect(currentState).toBeDefined();
      expect(currentState?.name).toBe("orders.pending");
      expect(currentState?.path).toBe("/orders/pending");

      expect(omitMeta(currentState)).toStrictEqual(omitMeta(state));
    });

    it("should handle transition with path parameters", async () => {
      const transitionSuccessListener = vi.fn();

      router.addEventListener(
        events.TRANSITION_SUCCESS,
        transitionSuccessListener,
      );

      const state = await router.start("/users/view/456");

      expect(transitionSuccessListener).toHaveBeenCalledTimes(1);

      const [toState] = transitionSuccessListener.mock.calls[0];

      expect(toState?.params).toStrictEqual({ id: "456" });

      expect(state?.params).toStrictEqual({ id: "456" });

      const currentState = router.getState();

      expect(currentState?.params).toStrictEqual({ id: "456" });
    });
  });

  // Note: Tests that mocked navigateToState were removed because
  // dependency injection now bypasses facade methods.
  // Transition error behavior is tested in "emit TRANSITION_ERROR on router start error" section.;

  describe("router start with state object", () => {
    describe("meta data handling", () => {
      it("should assign new meta id on transitions after starting with path", async () => {
        await router.start(homeState.path);

        expect(router.getState()?.meta?.id).toBeDefined();

        await router.navigate("users");

        const firstNavId = router.getState()?.meta?.id;

        await router.navigate("profile");

        expect(router.getState()?.meta?.id).not.toStrictEqual(firstNavId);
      });
    });

    describe("invalid path initialization attempt", () => {
      // Fix for issue #42: now returns ROUTE_NOT_FOUND error instead of throwing
      it("should return ROUTE_NOT_FOUND error for non-existent route path", async () => {
        router = createTestRouter({ allowNotFound: false });

        try {
          await router.start("/nonexistent");
          expect.fail("Should have thrown");
        } catch (error: any) {
          // Router should not be started
          expect(router.isActive()).toBe(false);

          expect(error).toBeDefined();
          expect(error.code).toBe(errorCodes.ROUTE_NOT_FOUND);

          // Router state should remain undefined
          expect(router.getState()).toBeUndefined();
        }
      });

      // Fix for issue #42: now returns ROUTE_NOT_FOUND error instead of throwing
      it("should return ROUTE_NOT_FOUND error for completely invalid route path", async () => {
        router = createTestRouter({ allowNotFound: false });

        try {
          await router.start("/invalid");
          expect.fail("Should have thrown");
        } catch (error: any) {
          expect(router.isActive()).toBe(false);

          expect(error).toBeDefined();
          expect(error.code).toBe(errorCodes.ROUTE_NOT_FOUND);

          expect(router.getState()).toBeUndefined();
        }
      });

      it("should handle empty path string", async () => {
        router = createTestRouter({ allowNotFound: false });

        // Empty path should fallback to defaultRoute or fail
        await router.start("");

        // With defaultRoute="home", empty path navigates to home
        expect(router.isActive()).toBe(true);
        expect(router.getState()?.name).toBe("home");
      });

      it("should handle invalid path", async () => {
        router = createTestRouter({ allowNotFound: false });

        try {
          await router.start("/missing-name");
          expect.fail("Should have thrown");
        } catch (error: any) {
          expect(router.isActive()).toBe(false);

          expect(error).toBeDefined();
          expect(error.code).toBe(errorCodes.ROUTE_NOT_FOUND);

          expect(router.getState()).toBeUndefined();
        }
      });

      it("should successfully navigate to valid path with params", async () => {
        router = createTestRouter({ allowNotFound: false });

        const state = await router.start("/users/view/123");

        expect(router.isActive()).toBe(true);

        expect(state).toBeDefined();
        expect(state?.name).toBe("users.view");
        expect(state?.params).toStrictEqual({ id: "123" });

        expect(router.getState()?.name).toBe("users.view");
      });

      it("should work normally for UNKNOWN_ROUTE special case", async () => {
        const unknownState = {
          name: constants.UNKNOWN_ROUTE,
          params: { path: "/custom/unknown/path" },
          path: "/custom/unknown/path",
        };

        // UNKNOWN_ROUTE has special handling in buildPath - should not throw
        const state = await router.start(unknownState.path);

        expect(router.isActive()).toBe(true);
        expect(state).toBeDefined();
      });

      it("should work normally for valid state objects", async () => {
        const validState = {
          name: "users.view",
          params: { id: "123" },
          path: "/users/view/123",
        };

        // Valid state should not throw and work normally
        const state = await router.start(validState.path);

        expect(state?.name).toBe("users.view");
        expect(state?.params).toStrictEqual({ id: "123" });
        expect(router.isActive()).toBe(true);
        expect(router.getState()?.name).toBe("users.view");
      });

      it("should work for valid routes with complex params", async () => {
        const validState = {
          name: "orders.view",
          params: { id: "456", filter: "pending" },
          path: "/orders/view/456",
        };

        const state = await router.start(validState.path);

        expect(state?.name).toBe("orders.view");
        expect(state?.params).toStrictEqual({
          id: "456",
          filter: "pending",
        });
        expect(router.getState()?.name).toBe("orders.view");
        expect(router.isActive()).toBe(true);
      });
    });

    describe("success and error events", () => {
      it("should emit TRANSITION_SUCCESS event on successful path start", async () => {
        const validPath = "/users/list";

        const transitionSuccessListener = vi.fn();

        router.addEventListener(
          events.TRANSITION_SUCCESS,
          transitionSuccessListener,
        );

        await router.start(validPath);

        // TRANSITION_SUCCESS should be emitted exactly once
        expect(transitionSuccessListener).toHaveBeenCalledTimes(1);
      });

      it("should pass correct toState in TRANSITION_SUCCESS event", async () => {
        const validPath = "/users/view/123";

        const transitionSuccessListener = vi.fn();

        router.addEventListener(
          events.TRANSITION_SUCCESS,
          transitionSuccessListener,
        );

        await router.start(validPath);

        const [toState] = transitionSuccessListener.mock.calls[0];

        // toState should contain correct route information
        expect(toState).toBeDefined();
        expect(toState.name).toBe("users.view");
        expect(toState.path).toBe("/users/view/123");
        expect(toState.params).toStrictEqual({ id: "123" });
      });

      it("should pass undefined as fromState in TRANSITION_SUCCESS event", async () => {
        const validPath = "/orders/pending";

        const transitionSuccessListener = vi.fn();

        router.addEventListener(
          events.TRANSITION_SUCCESS,
          transitionSuccessListener,
        );

        await router.start(validPath);

        const [, fromState] = transitionSuccessListener.mock.calls[0];

        // fromState should be undefined (no previous state)
        expect(fromState).toBeUndefined();
      });

      it("should pass replace:true options in TRANSITION_SUCCESS event", async () => {
        const validPath = "/settings/account";

        const transitionSuccessListener = vi.fn();

        router.addEventListener(
          events.TRANSITION_SUCCESS,
          transitionSuccessListener,
        );

        await router.start(validPath);

        const options = transitionSuccessListener.mock.calls[0][2];

        // options should contain replace: true
        expect(options).toStrictEqual({ replace: true });
      });

      it("should emit TRANSITION_SUCCESS for path start", async () => {
        const startPath = "/profile/";

        const transitionSuccessListener = vi.fn();

        router.addEventListener(
          events.TRANSITION_SUCCESS,
          transitionSuccessListener,
        );

        await router.start(startPath);

        // Should emit TRANSITION_SUCCESS
        expect(transitionSuccessListener).toHaveBeenCalledTimes(1);

        const [toState, fromState, options] =
          transitionSuccessListener.mock.calls[0];

        expect(toState.name).toBe("profile.me");
        expect(fromState).toBeUndefined();
        expect(options).toStrictEqual({ replace: true });
      });

      it("should emit TRANSITION_SUCCESS event", async () => {
        const validPath = "/home";

        const transitionSuccessListener = vi.fn();

        router.addEventListener(
          events.TRANSITION_SUCCESS,
          transitionSuccessListener,
        );

        const state = await router.start(validPath);

        // Event should be emitted
        expect(transitionSuccessListener).toHaveBeenCalledTimes(1);

        // Event state should match returned state
        const [eventToState] = transitionSuccessListener.mock.calls[0];

        expect(eventToState).toStrictEqual(state);
      });
    });

    describe("emit TRANSITION_ERROR on router start error", () => {
      it("should emit TRANSITION_ERROR with correct event structure", async () => {
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

        await router.start(validPath);

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

      it("should emit TRANSITION_ERROR when Promise rejects", async () => {
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

        try {
          await router.start(validPath);
          expect.fail("Should have thrown");
        } catch (error: any) {
          // Should emit TRANSITION_ERROR for rejected promises
          expect(transitionErrorListener).toHaveBeenCalledTimes(1);

          // Check the event data (users.view)
          const [toState, fromState, eventError] =
            transitionErrorListener.mock.calls[0];

          expect(toState.name).toBe("users.view");
          expect(fromState).toBeUndefined();
          expect(eventError).toBeDefined();

          // Error should be defined
          expect(error).toBeDefined();
        }
      });

      it("should emit TRANSITION_ERROR when transition is blocked", async () => {
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

        try {
          await router.start(validPath);
          expect.fail("Should have thrown");
        } catch (error: any) {
          // Issue #44: Error should be reported (no silent fallback)
          expect(transitionErrorListener).toHaveBeenCalledTimes(1);

          const [blockedToState, , eventError] =
            transitionErrorListener.mock.calls[0];

          expect(blockedToState.name).toBe("settings.general");
          expect(eventError).toBeDefined();

          // Error should be defined (no silent fallback)
          expect(error).toBeDefined();
        }
      });

      // Issue #44: No silent fallback - only TRANSITION_ERROR is emitted
      it("should emit only TRANSITION_ERROR when transition is blocked (no fallback)", async () => {
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

        await router.start(validPath);

        // TRANSITION_ERROR should be emitted for blocked route
        expect(transitionErrorListener).toHaveBeenCalledTimes(1);

        // No TRANSITION_SUCCESS - no silent fallback (issue #44)
        expect(transitionSuccessListener).not.toHaveBeenCalled();

        // Check error event
        const errorToState = transitionErrorListener.mock.calls[0][0];

        expect(errorToState.name).toBe("orders.completed");
      });

      // Issue #44: No silent fallback - router state remains undefined
      it("should not silently fallback when primary transition fails", async () => {
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

        await router.start(validPath);

        // Error should be emitted for blocked route
        expect(transitionErrorListener).toHaveBeenCalledTimes(1);

        const [blockedState] = transitionErrorListener.mock.calls[0];

        expect(blockedState.name).toBe("items");

        // Issue #44: Router state should be undefined (no silent fallback)
        expect(router.getState()).toBeUndefined();
      });

      it("should emit TRANSITION_ERROR for blocked state object transitions", async () => {
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

        await router.start(startState.path);

        // Should emit TRANSITION_ERROR for blocked state objects
        expect(transitionErrorListener).toHaveBeenCalledTimes(1);

        const [toState, fromState, error] =
          transitionErrorListener.mock.calls[0];

        expect(toState).toStrictEqual(startState);
        expect(fromState).toBeUndefined();
        expect(error).toBeDefined();
      });

      it("should handle Promise rejection with custom error data", async () => {
        router = createTestRouter({ allowNotFound: false });

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

        try {
          await router.start(validPath);
          expect.fail("Should have thrown");
        } catch (err: any) {
          // Should emit TRANSITION_ERROR with custom error data
          expect(transitionErrorListener).toHaveBeenCalledTimes(1);

          const error = transitionErrorListener.mock.calls[0][2];

          expect(error).toBeDefined();
          expect(error).toBeInstanceOf(Error); // RouterError
        }
      });
    });
  });

  describe("router start return value", () => {
    it("should start router with path", async () => {
      const stateObject = {
        name: "settings.general",
        params: {},
        path: "/settings/general",
      };

      await router.start(stateObject.path);
      expect(router.getState()?.name).toBe("settings.general");
    });
  });

  describe("Issue #42: router.start() should validate state objects when allowNotFound is false", () => {
    describe("invalid state object with allowNotFound = false", () => {
      beforeEach(() => {
        router = createTestRouter({ allowNotFound: false });
      });

      it("should return ROUTE_NOT_FOUND error for invalid state object", async () => {
        const invalidState = {
          name: "nonexistent.route",
          params: {},
          path: "/nonexistent",
        };
        await router.start(invalidState.path);

        expect(callback).toHaveBeenCalledTimes(1);

        const [error, state] = callback.mock.calls[0];

        expect(error).toBeDefined();
        expect(error.code).toBe(errorCodes.ROUTE_NOT_FOUND);
        expect(state).toBeUndefined();
      });

      it("should not start router when invalid state object is provided", async () => {
        const invalidState = {
          name: "nonexistent.route",
          params: {},
          path: "/nonexistent",
        };
        const startListener = vi.fn();

        router.addEventListener(events.ROUTER_START, startListener);

        await router.start(invalidState.path);

        expect(router.isActive()).toBe(false);
        expect(startListener).not.toHaveBeenCalled();
      });

      it("should emit TRANSITION_ERROR event for invalid state object", async () => {
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

        await router.start(invalidState.path);

        expect(transitionErrorListener).toHaveBeenCalledTimes(1);

        const [toState, fromState, error] =
          transitionErrorListener.mock.calls[0];

        expect(toState).toBeUndefined();
        expect(fromState).toBeUndefined();
        expect(error).toBeDefined();
        expect(error.code).toBe(errorCodes.ROUTE_NOT_FOUND);
      });

      it("should keep router state undefined after failed validation", async () => {
        const invalidState = {
          name: "nonexistent.route",
          params: {},
          path: "/nonexistent",
        };

        await router.start(invalidState.path);

        expect(router.getState()).toBeUndefined();
      });

      it("should not emit TRANSITION_SUCCESS for invalid state object", async () => {
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

        await router.start(invalidState.path);

        expect(transitionSuccessListener).not.toHaveBeenCalled();
      });

      it("should handle deeply nested invalid route names", async () => {
        const invalidState = {
          name: "deeply.nested.invalid.route.name",
          params: {},
          path: "/deeply/nested/invalid",
        };
        await router.start(invalidState.path);

        expect(callback).toHaveBeenCalledTimes(1);

        const [error] = callback.mock.calls[0];

        expect(error).toBeDefined();
        expect(error.code).toBe(errorCodes.ROUTE_NOT_FOUND);
      });
    });

    describe("invalid state object with allowNotFound = true", () => {
      beforeEach(() => {
        router = createTestRouter({ allowNotFound: true });
      });

      it("should accept invalid state object when allowNotFound is true", async () => {
        const invalidState = {
          name: "nonexistent.route",
          params: {},
          path: "/nonexistent",
        };
        await router.start(invalidState.path);

        expect(callback).toHaveBeenCalledTimes(1);

        const [error, state] = callback.mock.calls[0];

        expect(error).toBeUndefined();
        expect(state).toBeDefined();
      });

      it("should start router when allowNotFound is true", async () => {
        const invalidState = {
          name: "nonexistent.route",
          params: {},
          path: "/nonexistent",
        };
        const startListener = vi.fn();

        router.addEventListener(events.ROUTER_START, startListener);

        await router.start(invalidState.path);

        expect(router.isActive()).toBe(true);
        expect(startListener).toHaveBeenCalledTimes(1);
      });
    });

    describe("valid state object should work normally", () => {
      it("should accept valid state object", async () => {
        const validState = {
          name: "users.list",
          params: {},
          path: "/users/list",
        };
        const callback = vi.fn();

        const state = await router.start(validState.path);

        expect(state).toBeDefined();

        expect(state?.name).toBe("users.list");
      });

      it("should start router with valid state object", async () => {
        const validState = {
          name: "users.view",
          params: { id: "123" },
          path: "/users/view/123",
        };
        const startListener = vi.fn();

        router.addEventListener(events.ROUTER_START, startListener);

        await router.start(validState.path);

        expect(router.isActive()).toBe(true);
        expect(startListener).toHaveBeenCalledTimes(1);
      });
    });

    describe("consistency between string paths and state objects", () => {
      beforeEach(() => {
        router = createTestRouter({ allowNotFound: false });
      });

      it("should handle invalid path string the same as invalid state object", async () => {
        const pathCallback = vi.fn();
        const stateCallback = vi.fn();

        // First router with invalid path
        const router1 = createTestRouter({ allowNotFound: false });

        router1.start("/nonexistent/path", pathCallback);

        // Second router with invalid state object
        const router2 = createTestRouter({ allowNotFound: false });

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
        expect(router1.isActive()).toBe(false);
        expect(router2.isActive()).toBe(false);

        router1.stop();
        router2.stop();
      });
    });
  });

  describe("Issue #43: router.start() should pass replace: true option", () => {
    // Note: Tests that spied on navigateToState were removed because
    // dependency injection now bypasses facade methods.
    // The behavior is verified via TRANSITION_SUCCESS event.

    it("should use replace: true in TRANSITION_SUCCESS event for path string", async () => {
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

    it("should use replace: true in TRANSITION_SUCCESS event for state object", async () => {
      const transitionSuccessListener = vi.fn();
      const validState = {
        name: "users.view",
        params: { id: "456" },
        path: "/users/view/456",
      };

      router.addEventListener(
        events.TRANSITION_SUCCESS,
        transitionSuccessListener,
      );

      await router.start(validState.path);

      expect(transitionSuccessListener).toHaveBeenCalledTimes(1);

      const [toState, fromState, options] =
        transitionSuccessListener.mock.calls[0];

      expect(toState.name).toBe("users.view");
      expect(toState.params).toStrictEqual({ id: "456" });
      expect(fromState).toBeUndefined();
      expect(options).toStrictEqual({ replace: true });
    });

    it("should use replace: true for unknown route when allowNotFound is true", async () => {
      router = createTestRouter({ allowNotFound: true });

      const transitionSuccessListener = vi.fn();

      router.addEventListener(
        events.TRANSITION_SUCCESS,
        transitionSuccessListener,
      );

      router.start("/unknown/path");

      expect(transitionSuccessListener).toHaveBeenCalledTimes(1);

      const options = transitionSuccessListener.mock.calls[0][2];

      expect(options).toStrictEqual({ replace: true });
    });
  });
});
