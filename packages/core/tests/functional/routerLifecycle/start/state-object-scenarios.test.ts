import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import {
  constants,
  errorCodes,
  events,
  getLifecycleApi,
  getPluginApi,
} from "@real-router/core";

import { createTestRouter, omitMeta } from "../../../helpers";

import type { LifecycleApi, Router, State } from "@real-router/core";

let router: Router;
let lifecycle: LifecycleApi;
const homeState: State = {
  name: "home",
  params: {},
  path: "/home",
  meta: { id: 5, params: { home: {} }, options: {} },
};

describe("router.start() - state object scenarios", () => {
  beforeEach(() => {
    router = createTestRouter();
    lifecycle = getLifecycleApi(router);
  });

  afterEach(() => {
    router.stop();
  });

  describe("successful state transition", () => {
    it("should start router and transition successfully", async () => {
      const startListener = vi.fn();
      const transitionSuccessListener = vi.fn();

      getPluginApi(router).addEventListener(events.ROUTER_START, startListener);
      getPluginApi(router).addEventListener(
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

      getPluginApi(router).addEventListener(
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

      getPluginApi(router).addEventListener(
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

        try {
          await router.start("");

          expect.fail("Should have thrown");
        } catch (error: any) {
          expect(error).toBeDefined();
        }
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
          params: { id: "456" },
          path: "/orders/view/456",
        };

        const state = await router.start(validState.path);

        expect(state?.name).toBe("orders.view");
        expect(state?.params).toStrictEqual({
          id: "456",
        });
        expect(router.getState()?.name).toBe("orders.view");
        expect(router.isActive()).toBe(true);
      });
    });

    describe("success and error events", () => {
      it("should emit TRANSITION_SUCCESS event on successful path start", async () => {
        const validPath = "/users/list";

        const transitionSuccessListener = vi.fn();

        getPluginApi(router).addEventListener(
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

        getPluginApi(router).addEventListener(
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

        getPluginApi(router).addEventListener(
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

        getPluginApi(router).addEventListener(
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

        getPluginApi(router).addEventListener(
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

        getPluginApi(router).addEventListener(
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

        lifecycle.addActivateGuard("orders.view", () => () => {
          throw new Error("Blocked");
        });

        const transitionErrorListener = vi.fn();

        getPluginApi(router).addEventListener(
          events.TRANSITION_ERROR,
          transitionErrorListener,
        );

        try {
          await router.start(validPath);
        } catch {
          // Expected error
        }

        expect(transitionErrorListener).toHaveBeenCalledTimes(1);

        const [toState, fromState, error] =
          transitionErrorListener.mock.calls[0];

        expect(toState).toBeDefined();
        expect(toState.name).toBe("orders.view");
        expect(toState.path).toBe("/orders/view/456");
        expect(toState.params).toStrictEqual({ id: "456" });

        expect(fromState).toBeUndefined();

        expect(error).toBeDefined();
        expect(error).toBeInstanceOf(Error);
      });

      it("should emit TRANSITION_ERROR when Promise rejects", async () => {
        const validPath = "/users/view/789";

        lifecycle.addActivateGuard(
          "users.view",
          () => () => Promise.reject(new Error("Async access denied")),
        );

        const transitionErrorListener = vi.fn();

        getPluginApi(router).addEventListener(
          events.TRANSITION_ERROR,
          transitionErrorListener,
        );

        try {
          await router.start(validPath);

          expect.fail("Should have thrown");
        } catch (error: any) {
          expect(transitionErrorListener).toHaveBeenCalledTimes(1);

          const [toState, fromState, eventError] =
            transitionErrorListener.mock.calls[0];

          expect(toState.name).toBe("users.view");
          expect(fromState).toBeUndefined();
          expect(eventError).toBeDefined();

          expect(error).toBeDefined();
        }
      });

      it("should emit TRANSITION_ERROR when transition is blocked", async () => {
        const validPath = "/settings/general";

        lifecycle.addActivateGuard("settings.general", () => () => {
          throw new Error("Blocked");
        });

        const transitionErrorListener = vi.fn();

        getPluginApi(router).addEventListener(
          events.TRANSITION_ERROR,
          transitionErrorListener,
        );

        try {
          await router.start(validPath);

          expect.fail("Should have thrown");
        } catch (error: any) {
          expect(transitionErrorListener).toHaveBeenCalledTimes(1);

          const [blockedToState, , eventError] =
            transitionErrorListener.mock.calls[0];

          expect(blockedToState.name).toBe("settings.general");
          expect(eventError).toBeDefined();

          expect(error).toBeDefined();
        }
      });

      it("should emit only TRANSITION_ERROR when transition is blocked (no fallback)", async () => {
        const validPath = "/orders/completed";

        lifecycle.addActivateGuard("orders.completed", () => () => {
          throw new Error("Blocked");
        });

        const transitionSuccessListener = vi.fn();
        const transitionErrorListener = vi.fn();

        getPluginApi(router).addEventListener(
          events.TRANSITION_SUCCESS,
          transitionSuccessListener,
        );
        getPluginApi(router).addEventListener(
          events.TRANSITION_ERROR,
          transitionErrorListener,
        );

        try {
          await router.start(validPath);
        } catch {
          // Expected error
        }

        expect(transitionErrorListener).toHaveBeenCalledTimes(1);

        expect(transitionSuccessListener).not.toHaveBeenCalled();

        const errorToState = transitionErrorListener.mock.calls[0][0];

        expect(errorToState.name).toBe("orders.completed");
      });

      it("should not silently fallback when primary transition fails", async () => {
        const validPath = "/items/123";

        lifecycle.addActivateGuard("items", () => () => {
          throw new Error("Blocked");
        });

        const transitionErrorListener = vi.fn();

        getPluginApi(router).addEventListener(
          events.TRANSITION_ERROR,
          transitionErrorListener,
        );

        try {
          await router.start(validPath);
        } catch {
          // Expected error
        }

        expect(transitionErrorListener).toHaveBeenCalledTimes(1);

        const [blockedState] = transitionErrorListener.mock.calls[0];

        expect(blockedState.name).toBe("items");

        expect(router.getState()).toBeUndefined();
      });

      it("should emit TRANSITION_ERROR for blocked state object transitions", async () => {
        const startState = {
          name: "users.view",
          params: { id: "999" },
          path: "/users/view/999",
        };

        lifecycle.addActivateGuard("users.view", () => () => {
          throw new Error("Blocked");
        });

        const transitionErrorListener = vi.fn();

        getPluginApi(router).addEventListener(
          events.TRANSITION_ERROR,
          transitionErrorListener,
        );

        try {
          await router.start(startState.path);
        } catch {
          // Expected error
        }

        expect(transitionErrorListener).toHaveBeenCalledTimes(1);

        const [toState, fromState, error] =
          transitionErrorListener.mock.calls[0];

        expect(omitMeta(toState)).toStrictEqual(startState);
        expect(fromState).toBeUndefined();
        expect(error).toBeDefined();
      });

      it("should handle Promise rejection with custom error data", async () => {
        router = createTestRouter({ allowNotFound: false });

        const validPath = "/profile/user/123";

        lifecycle.addActivateGuard(
          "profile.user",
          () => () =>
            Promise.reject({
              message: "Custom async error",
              errorType: "PERMISSION_DENIED",
              userId: "123",
            }),
        );

        const transitionErrorListener = vi.fn();

        getPluginApi(router).addEventListener(
          events.TRANSITION_ERROR,
          transitionErrorListener,
        );

        try {
          await router.start(validPath);

          expect.fail("Should have thrown");
        } catch {
          expect(transitionErrorListener).toHaveBeenCalledTimes(1);

          const error = transitionErrorListener.mock.calls[0][2];

          expect(error).toBeDefined();
          expect(error).toBeInstanceOf(Error);
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

        try {
          await router.start(invalidState.path);

          expect.fail("Should have thrown");
        } catch (error: any) {
          expect(error).toBeDefined();
          expect(error.code).toBe(errorCodes.ROUTE_NOT_FOUND);
        }
      });

      it("should not start router when invalid state object is provided", async () => {
        const invalidState = {
          name: "nonexistent.route",
          params: {},
          path: "/nonexistent",
        };
        const startListener = vi.fn();

        getPluginApi(router).addEventListener(
          events.ROUTER_START,
          startListener,
        );

        try {
          await router.start(invalidState.path);
        } catch {
          // Expected error
        }

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

        getPluginApi(router).addEventListener(
          events.TRANSITION_ERROR,
          transitionErrorListener,
        );

        try {
          await router.start(invalidState.path);
        } catch {
          // Expected error
        }

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

        try {
          await router.start(invalidState.path);
        } catch {
          // Expected error
        }

        expect(router.getState()).toBeUndefined();
      });

      it("should not emit TRANSITION_SUCCESS for invalid state object", async () => {
        const invalidState = {
          name: "nonexistent.route",
          params: {},
          path: "/nonexistent",
        };
        const transitionSuccessListener = vi.fn();

        getPluginApi(router).addEventListener(
          events.TRANSITION_SUCCESS,
          transitionSuccessListener,
        );

        try {
          await router.start(invalidState.path);
        } catch {
          // Expected error
        }

        expect(transitionSuccessListener).not.toHaveBeenCalled();
      });

      it("should handle deeply nested invalid route names", async () => {
        const invalidState = {
          name: "deeply.nested.invalid.route.name",
          params: {},
          path: "/deeply/nested/invalid",
        };

        try {
          await router.start(invalidState.path);

          expect.fail("Should have thrown");
        } catch (error: any) {
          expect(error).toBeDefined();
          expect(error.code).toBe(errorCodes.ROUTE_NOT_FOUND);
        }
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
        const state = await router.start(invalidState.path);

        expect(state).toBeDefined();
      });

      it("should start router when allowNotFound is true", async () => {
        const invalidState = {
          name: "nonexistent.route",
          params: {},
          path: "/nonexistent",
        };
        const startListener = vi.fn();

        getPluginApi(router).addEventListener(
          events.ROUTER_START,
          startListener,
        );

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

        getPluginApi(router).addEventListener(
          events.ROUTER_START,
          startListener,
        );

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
        // First router with invalid path
        const router1 = createTestRouter({ allowNotFound: false });

        let pathError: any;

        try {
          await router1.start("/nonexistent/path");

          expect.fail("Should have thrown");
        } catch (error: any) {
          pathError = error;
        }

        // Second router with invalid state object
        const router2 = createTestRouter({ allowNotFound: false });

        let stateError: any;

        try {
          await router2.start("/nonexistent");

          expect.fail("Should have thrown");
        } catch (error: any) {
          stateError = error;
        }

        // Both should return ROUTE_NOT_FOUND error
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

      getPluginApi(router).addEventListener(
        events.TRANSITION_SUCCESS,
        transitionSuccessListener,
      );

      await router.start("/users/list");

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

      getPluginApi(router).addEventListener(
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

      getPluginApi(router).addEventListener(
        events.TRANSITION_SUCCESS,
        transitionSuccessListener,
      );

      await router.start("/unknown/path");

      expect(transitionSuccessListener).toHaveBeenCalledTimes(1);

      const options = transitionSuccessListener.mock.calls[0][2];

      expect(options).toStrictEqual({ replace: true });
    });
  });
});
