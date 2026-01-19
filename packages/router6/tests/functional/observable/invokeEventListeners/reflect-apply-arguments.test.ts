import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { events, RouterError } from "router6";

import { createTestRouter } from "../../../helpers";

import type { Router, NavigationOptions } from "router6";

let router: Router;

describe("invokeEventListeners - Reflect.apply argument passing", () => {
  beforeEach(() => {
    router = createTestRouter();

    router.start();
  });

  afterEach(() => {
    router.stop();
  });

  it("should use Function.prototype.apply.call for TypeScript compatibility", () => {
    // This test documents why we use Function.prototype.apply.call
    const listener = vi.fn();

    router.addEventListener(events.ROUTER_START, listener);

    // Spy on Function.prototype.apply to ensure it's being called
    // @ts-expect-error - Testing invalid parameters
    // eslint-disable-next-line @typescript-eslint/unbound-method -- intentionally spying on prototype method for testing
    const applySpy = vi.spyOn(Function.prototype.apply, "call");

    router.invokeEventListeners(events.ROUTER_START);

    expect(applySpy).toHaveBeenCalled();
    expect(listener).toHaveBeenCalled();

    applySpy.mockRestore();
  });

  describe("correct argument passing through Reflect.apply", () => {
    it("should pass arguments to listener in correct order", () => {
      const toState = {
        name: "dashboard",
        params: { id: "123" },
        path: "/dashboard/123",
      };
      const fromState = { name: "login", params: {}, path: "/login" };
      const navigationOptions: NavigationOptions = {
        replace: true,
        reload: false,
        force: true,
      };

      const argumentLogger = vi.fn(
        (receivedToState, receivedFromState, receivedOptions) => {
          expect(receivedToState).toStrictEqual(toState);
          expect(receivedFromState).toStrictEqual(fromState);
          expect(receivedOptions).toStrictEqual(navigationOptions);
        },
      );

      router.addEventListener(events.TRANSITION_SUCCESS, argumentLogger);

      router.invokeEventListeners(
        events.TRANSITION_SUCCESS,
        toState,
        fromState,
        navigationOptions,
      );

      expect(argumentLogger).toHaveBeenCalledWith(
        toState,
        fromState,
        navigationOptions,
      );
    });

    it("should pass argument array correctly through Reflect.apply", () => {
      const toState = {
        name: "profile",
        params: { userId: "456" },
        path: "/profile/456",
      };
      const fromState = { name: "home", params: {}, path: "/home" };
      const navigationOptions: NavigationOptions = {
        replace: false,
        customProperty: "testValue",
      };

      const reflectApplyTester = vi.fn((...args) => {
        expect(args).toHaveLength(3);
        expect(args[0]).toStrictEqual(toState);
        expect(args[1]).toStrictEqual(fromState);
        expect(args[2]).toStrictEqual(navigationOptions);
        expect(Array.isArray(args)).toBe(true);
      });

      router.addEventListener(events.TRANSITION_SUCCESS, reflectApplyTester);

      router.invokeEventListeners(
        events.TRANSITION_SUCCESS,
        toState,
        fromState,
        navigationOptions,
      );

      expect(reflectApplyTester).toHaveBeenCalledTimes(1);
    });

    it("should set context (this) as undefined", () => {
      const toState = { name: "settings", params: {}, path: "/settings" };
      const fromState = { name: "account", params: {}, path: "/account" };
      const navigationOptions: NavigationOptions = { reload: true };

      const contextTester = vi.fn(function (this: any) {
        expect(this).toBeUndefined();
      });

      router.addEventListener(events.TRANSITION_SUCCESS, contextTester);

      router.invokeEventListeners(
        events.TRANSITION_SUCCESS,
        toState,
        fromState,
        navigationOptions,
      );

      expect(contextTester).toHaveBeenCalledWith(
        toState,
        fromState,
        navigationOptions,
      );
    });

    it("should make all parameters available in listener in expected format", () => {
      const toState = {
        name: "orders",
        params: { filter: "recent", page: 1 },
        path: "/orders?filter=recent&page=1",
      };
      const fromState = {
        name: "cart",
        params: { items: 3 },
        path: "/cart",
      };
      const navigationOptions: NavigationOptions = {
        replace: false,
        reload: true,
        force: false,
        metadata: { timestamp: Date.now(), source: "user" },
        // @ts-expect-error - Testing invalid parameters
        flags: ["analytics", "tracking"],
      };

      const parameterFormatTester = vi.fn(
        (receivedToState, receivedFromState, receivedOptions) => {
          // Test toState format and accessibility
          expect(receivedToState.name).toBe("orders");
          expect(receivedToState.params.filter).toBe("recent");
          expect(receivedToState.params.page).toBe(1);
          expect(receivedToState.path).toBe("/orders?filter=recent&page=1");

          // Test fromState format and accessibility
          expect(receivedFromState.name).toBe("cart");
          expect(receivedFromState.params.items).toBe(3);
          expect(receivedFromState.path).toBe("/cart");

          // Test navigationOptions format and accessibility
          expect(receivedOptions.replace).toBe(false);
          expect(receivedOptions.reload).toBe(true);
          expect(receivedOptions.force).toBe(false);
          expect(receivedOptions.metadata.source).toBe("user");
          expect(receivedOptions.flags).toStrictEqual([
            "analytics",
            "tracking",
          ]);
        },
      );

      router.addEventListener(events.TRANSITION_SUCCESS, parameterFormatTester);

      router.invokeEventListeners(
        events.TRANSITION_SUCCESS,
        toState,
        fromState,
        navigationOptions,
      );

      expect(parameterFormatTester).toHaveBeenCalledTimes(1);
    });

    it("should handle TRANSITION_START events with correct argument passing", () => {
      const toState = { name: "help", params: {}, path: "/help" };
      const fromState = { name: "support", params: {}, path: "/support" };

      const transitionStartTester = vi.fn(
        (receivedToState, receivedFromState) => {
          expect(receivedToState).toStrictEqual(toState);
          expect(receivedFromState).toStrictEqual(fromState);
        },
      );

      router.addEventListener(events.TRANSITION_START, transitionStartTester);

      router.invokeEventListeners(events.TRANSITION_START, toState, fromState);

      expect(transitionStartTester).toHaveBeenCalledWith(toState, fromState);
    });

    it("should handle TRANSITION_ERROR events with RouterError parameter", () => {
      const toState = { name: "contact", params: {}, path: "/contact" };
      const fromState = { name: "about", params: {}, path: "/about" };
      const routerError = new RouterError("NAVIGATION_ERROR", {
        message: "Navigation failed",
        path: "/contact",
      });

      const errorTester = vi.fn(
        (receivedToState, receivedFromState, receivedError) => {
          expect(receivedToState).toStrictEqual(toState);
          expect(receivedFromState).toStrictEqual(fromState);
          expect(receivedError).toBe(routerError);
          expect(receivedError instanceof RouterError).toBe(true);
          expect(receivedError.code).toBe("NAVIGATION_ERROR");
          expect(receivedError.message).toBe("Navigation failed");
        },
      );

      router.addEventListener(events.TRANSITION_ERROR, errorTester);

      router.invokeEventListeners(
        events.TRANSITION_ERROR,
        toState,
        fromState,
        routerError,
      );

      expect(errorTester).toHaveBeenCalledWith(toState, fromState, routerError);
    });

    it("should handle default events with no arguments correctly", () => {
      const defaultEventTester = vi.fn((...args) => {
        expect(args).toHaveLength(0);
        expect(Array.isArray(args)).toBe(true);
      });

      router.addEventListener(events.ROUTER_START, defaultEventTester);

      router.invokeEventListeners(events.ROUTER_START);

      expect(defaultEventTester).toHaveBeenCalledWith();
    });

    it("should preserve object references through Reflect.apply", () => {
      const toState = {
        name: "search",
        params: { query: "test" },
        path: "/search?query=test",
      };
      const fromState = { name: "results", params: {}, path: "/results" };
      const navigationOptions: NavigationOptions = {
        replace: true,
        customObject: { nested: { value: "preserved" } },
      };

      const referencePreservationTester = vi.fn(
        (receivedToState, receivedFromState, receivedOptions) => {
          // Test that object references are preserved, not deep cloned
          expect(receivedToState).toBe(toState); // Same reference
          expect(receivedFromState).toBe(fromState); // Same reference
          expect(receivedOptions).toBe(navigationOptions); // Same reference

          // Test that nested objects are also preserved
          expect(receivedOptions.customObject).toBe(
            navigationOptions.customObject,
          );
          expect(receivedOptions.customObject.nested).toBe(
            // @ts-expect-error - Testing invalid parameters
            navigationOptions.customObject?.nested,
          );
        },
      );

      router.addEventListener(
        events.TRANSITION_SUCCESS,
        referencePreservationTester,
      );

      router.invokeEventListeners(
        events.TRANSITION_SUCCESS,
        toState,
        fromState,
        navigationOptions,
      );

      expect(referencePreservationTester).toHaveBeenCalledTimes(1);
    });

    it("should handle complex nested parameters correctly", () => {
      const toState = {
        name: "admin",
        params: {
          section: "users",
          filters: { active: true, role: "admin" },
          pagination: { page: 1, limit: 50 },
        },
        path: "/admin/users?active=true&role=admin&page=1&limit=50",
      };
      const fromState = {
        name: "dashboard",
        params: {
          widgets: ["analytics", "reports"],
          theme: { mode: "dark", color: "blue" },
        },
        path: "/dashboard",
      };
      const navigationOptions: NavigationOptions = {
        replace: false,
        metadata: {
          user: { id: "123", role: "admin" },
          session: { started: Date.now(), features: ["audit", "export"] },
        },
      };

      const complexParameterTester = vi.fn(
        (receivedToState, receivedFromState, receivedOptions) => {
          // Deep access to nested parameters
          expect(receivedToState.params.filters.active).toBe(true);
          expect(receivedToState.params.pagination.limit).toBe(50);
          expect(receivedFromState.params.widgets).toStrictEqual([
            "analytics",
            "reports",
          ]);
          expect(receivedFromState.params.theme.mode).toBe("dark");
          expect(receivedOptions.metadata.user.role).toBe("admin");
          expect(receivedOptions.metadata.session.features).toStrictEqual([
            "audit",
            "export",
          ]);
        },
      );

      router.addEventListener(
        events.TRANSITION_SUCCESS,
        complexParameterTester,
      );

      router.invokeEventListeners(
        events.TRANSITION_SUCCESS,
        toState,
        fromState,
        navigationOptions,
      );

      expect(complexParameterTester).toHaveBeenCalledTimes(1);
    });

    it("should maintain argument integrity with multiple listeners", () => {
      const toState = { name: "reports", params: {}, path: "/reports" };
      const fromState = {
        name: "analytics",
        params: {},
        path: "/analytics",
      };
      const navigationOptions: NavigationOptions = { force: true };

      const firstListener = vi.fn(
        (receivedToState, _receivedFromState, receivedOptions) => {
          // Modify received objects to test if they affect other listeners
          receivedToState.modified = true;
          receivedOptions.modified = true;
        },
      );

      const secondListener = vi.fn(
        (receivedToState, _receivedFromState, receivedOptions) => {
          // Should receive the same modified objects (same references)
          expect(receivedToState.modified).toBe(true);
          expect(receivedOptions.modified).toBe(true);
        },
      );

      router.addEventListener(events.TRANSITION_SUCCESS, firstListener);
      router.addEventListener(events.TRANSITION_SUCCESS, secondListener);

      router.invokeEventListeners(
        events.TRANSITION_SUCCESS,
        toState,
        fromState,
        navigationOptions,
      );

      expect(firstListener).toHaveBeenCalledWith(
        toState,
        fromState,
        navigationOptions,
      );
      expect(secondListener).toHaveBeenCalledWith(
        toState,
        fromState,
        navigationOptions,
      );
    });

    it("should handle function-specific argument patterns correctly", () => {
      // Test arrow function
      const arrowListener = vi.fn((toState, fromState, options) => {
        expect(toState).toBeDefined();
        expect(fromState).toBeDefined();
        expect(options).toBeDefined();
      });

      // Test regular function
      const regularListener = vi.fn(function (toState, fromState, options) {
        expect(arguments).toHaveLength(3);
        expect(arguments[0]).toBe(toState);
        expect(arguments[1]).toBe(fromState);
        expect(arguments[2]).toBe(options);
      });

      const toState = { name: "test", params: {}, path: "/test" };
      const fromState = { name: "prev", params: {}, path: "/prev" };
      const navigationOptions: NavigationOptions = { reload: false };

      router.addEventListener(events.TRANSITION_SUCCESS, arrowListener);
      router.addEventListener(events.TRANSITION_SUCCESS, regularListener);

      router.invokeEventListeners(
        events.TRANSITION_SUCCESS,
        toState,
        fromState,
        navigationOptions,
      );

      expect(arrowListener).toHaveBeenCalledWith(
        toState,
        fromState,
        navigationOptions,
      );
      expect(regularListener).toHaveBeenCalledWith(
        toState,
        fromState,
        navigationOptions,
      );
    });
  });
});
