import {
  describe,
  beforeEach,
  afterEach,
  it,
  expect,
  expectTypeOf,
} from "vitest";

import { events, RouterError } from "@real-router/core";

import { createTestRouter } from "../../../helpers";

import type { Router, NavigationOptions } from "@real-router/core";

let router: Router;

describe("invokeEventListeners - TRANSITION_SUCCESS event", () => {
  beforeEach(() => {
    router = createTestRouter();

    router.start();
  });

  afterEach(() => {
    router.stop();
  });

  describe("validation of TRANSITION_SUCCESS event", () => {
    describe("successful TRANSITION_SUCCESS event call with NavigationOptions", () => {
      it("should call all listeners with three parameters when NavigationOptions is provided", () => {
        const toState = {
          name: "dashboard",
          params: {},
          path: "/dashboard",
        };
        const fromState = { name: "login", params: {}, path: "/login" };
        const navigationOptions: NavigationOptions = {
          replace: false,
          reload: true,
          force: false,
        };
        const listener1 = vi.fn();
        const listener2 = vi.fn();
        const listener3 = vi.fn();

        router.addEventListener(events.TRANSITION_SUCCESS, listener1);
        router.addEventListener(events.TRANSITION_SUCCESS, listener2);
        router.addEventListener(events.TRANSITION_SUCCESS, listener3);

        router.invokeEventListeners(
          events.TRANSITION_SUCCESS,
          toState,
          fromState,
          navigationOptions,
        );

        expect(listener1).toHaveBeenCalledWith(
          toState,
          fromState,
          navigationOptions,
        );
        expect(listener2).toHaveBeenCalledWith(
          toState,
          fromState,
          navigationOptions,
        );
        expect(listener3).toHaveBeenCalledWith(
          toState,
          fromState,
          navigationOptions,
        );
      });

      it("should pass NavigationOptions as the last argument unchanged", () => {
        const toState = {
          name: "profile",
          params: { id: "123" },
          path: "/profile/123",
        };
        const fromState = { name: "home", params: {}, path: "/home" };
        const navigationOptions: NavigationOptions = {
          replace: true,
          reload: false,
          skipTransition: false,
          force: true,
          forceDeactivate: false,
          redirected: false,
        };
        const listener = vi.fn();

        router.addEventListener(events.TRANSITION_SUCCESS, listener);

        router.invokeEventListeners(
          events.TRANSITION_SUCCESS,
          toState,
          fromState,
          navigationOptions,
        );

        const receivedOptions = listener.mock.calls[0][2];

        expect(receivedOptions).toBe(navigationOptions);
        expect(receivedOptions.replace).toBe(true);
        expect(receivedOptions.reload).toBe(false);
        expect(receivedOptions.force).toBe(true);
      });

      it("should execute without errors when called with valid parameters", () => {
        const toState = { name: "settings", params: {}, path: "/settings" };
        const fromState = { name: "account", params: {}, path: "/account" };
        const navigationOptions: NavigationOptions = { replace: false };

        expect(() => {
          router.invokeEventListeners(
            events.TRANSITION_SUCCESS,
            toState,
            fromState,
            navigationOptions,
          );
        }).not.toThrowError();
      });

      it("should handle successful transition state correctly through listeners", () => {
        const toState = { name: "orders", params: {}, path: "/orders" };
        const fromState = { name: "cart", params: {}, path: "/cart" };
        const navigationOptions: NavigationOptions = {
          replace: false,
          reload: true,
        };
        const transitionResults: string[] = [];

        const listener1 = vi.fn((toState, fromState) => {
          transitionResults.push(
            `Transitioned from ${fromState.name} to ${toState.name}`,
          );
        });

        const listener2 = vi.fn((_toState, _fromState, options) => {
          transitionResults.push(
            `Options: replace=${options.replace}, reload=${options.reload}`,
          );
        });

        router.addEventListener(events.TRANSITION_SUCCESS, listener1);
        router.addEventListener(events.TRANSITION_SUCCESS, listener2);

        router.invokeEventListeners(
          events.TRANSITION_SUCCESS,
          toState,
          fromState,
          navigationOptions,
        );

        expect(listener1).toHaveBeenCalledWith(
          toState,
          fromState,
          navigationOptions,
        );
        expect(listener2).toHaveBeenCalledWith(
          toState,
          fromState,
          navigationOptions,
        );
        expect(transitionResults).toStrictEqual([
          "Transitioned from cart to orders",
          "Options: replace=false, reload=true",
        ]);
      });

      it("should work with complex NavigationOptions containing custom properties", () => {
        const toState = { name: "help", params: {}, path: "/help" };
        const fromState = { name: "support", params: {}, path: "/support" };
        const navigationOptions: NavigationOptions = {
          replace: true,
          reload: false,
          customProperty: "customValue",
          metadata: { timestamp: Date.now(), user: "testUser" },
          // @ts-expect-error - Testing invalid parameters
          flags: [1, 2, 3],
        };
        const listener = vi.fn();

        router.addEventListener(events.TRANSITION_SUCCESS, listener);

        router.invokeEventListeners(
          events.TRANSITION_SUCCESS,
          toState,
          fromState,
          navigationOptions,
        );

        const receivedOptions = listener.mock.calls[0][2];

        expect(receivedOptions.customProperty).toBe("customValue");
        expect(receivedOptions.metadata).toStrictEqual({
          timestamp: expect.any(Number),
          user: "testUser",
        });
        expect(receivedOptions.flags).toStrictEqual([1, 2, 3]);
      });

      it("should handle empty NavigationOptions object correctly", () => {
        const toState = { name: "contact", params: {}, path: "/contact" };
        const fromState = { name: "about", params: {}, path: "/about" };
        const navigationOptions: NavigationOptions = {};
        const listener = vi.fn();

        router.addEventListener(events.TRANSITION_SUCCESS, listener);

        router.invokeEventListeners(
          events.TRANSITION_SUCCESS,
          toState,
          fromState,
          navigationOptions,
        );

        expect(listener).toHaveBeenCalledWith(
          toState,
          fromState,
          navigationOptions,
        );
        expect(listener).toHaveBeenCalledTimes(1);
      });

      it("should call listeners in registration order with NavigationOptions", () => {
        const toState = {
          name: "search",
          params: { query: "test" },
          path: "/search?query=test",
        };
        const fromState = { name: "results", params: {}, path: "/results" };
        const navigationOptions: NavigationOptions = { reload: true };
        const callOrder: number[] = [];

        const listener1 = vi.fn(() => callOrder.push(1));
        const listener2 = vi.fn(() => callOrder.push(2));
        const listener3 = vi.fn(() => callOrder.push(3));

        router.addEventListener(events.TRANSITION_SUCCESS, listener1);
        router.addEventListener(events.TRANSITION_SUCCESS, listener2);
        router.addEventListener(events.TRANSITION_SUCCESS, listener3);

        router.invokeEventListeners(
          events.TRANSITION_SUCCESS,
          toState,
          fromState,
          navigationOptions,
        );

        expect(callOrder).toStrictEqual([1, 2, 3]);
        expect(listener1).toHaveBeenCalledWith(
          toState,
          fromState,
          navigationOptions,
        );
        expect(listener2).toHaveBeenCalledWith(
          toState,
          fromState,
          navigationOptions,
        );
        expect(listener3).toHaveBeenCalledWith(
          toState,
          fromState,
          navigationOptions,
        );
      });
    });

    describe("error when toState is missing for TRANSITION_SUCCESS event", () => {
      it("should throw TypeError with correct message when toState is undefined", () => {
        const fromState = { name: "login", params: {}, path: "/login" };
        const navigationOptions: NavigationOptions = {
          replace: false,
          reload: true,
        };

        expect(() => {
          router.invokeEventListeners(
            events.TRANSITION_SUCCESS,
            undefined,
            fromState,
            navigationOptions,
          );
        }).toThrowError(TypeError);
      });

      it("should fail !toState validation check when toState is undefined", () => {
        const fromState = { name: "home", params: {}, path: "/home" };
        const navigationOptions: NavigationOptions = { force: true };
        const undefinedToState = undefined;

        // Verify that !toState check would return true for undefined
        expect(!undefinedToState).toBe(true);

        expect(() => {
          router.invokeEventListeners(
            events.TRANSITION_SUCCESS,
            undefinedToState,
            fromState,
            navigationOptions,
          );
        }).toThrowError(TypeError);
      });

      it("should not notify any listeners when toState validation fails", () => {
        const fromState = {
          name: "dashboard",
          params: {},
          path: "/dashboard",
        };
        const navigationOptions: NavigationOptions = {
          replace: true,
          reload: false,
        };
        const listener1 = vi.fn();
        const listener2 = vi.fn();
        const listener3 = vi.fn();

        router.addEventListener(events.TRANSITION_SUCCESS, listener1);
        router.addEventListener(events.TRANSITION_SUCCESS, listener2);
        router.addEventListener(events.TRANSITION_SUCCESS, listener3);

        expect(() => {
          router.invokeEventListeners(
            events.TRANSITION_SUCCESS,
            undefined,
            fromState,
            navigationOptions,
          );
        }).toThrowError(TypeError);

        expect(listener1).not.toHaveBeenCalled();
        expect(listener2).not.toHaveBeenCalled();
        expect(listener3).not.toHaveBeenCalled();
      });

      it("should throw TypeError when toState is null", () => {
        const fromState = { name: "profile", params: {}, path: "/profile" };
        const navigationOptions: NavigationOptions = {
          skipTransition: false,
        };
        const nullToState = null;

        expect(() => {
          router.invokeEventListeners(
            events.TRANSITION_SUCCESS,
            // @ts-expect-error - Testing invalid parameters
            nullToState,
            fromState,
            navigationOptions,
          );
        }).toThrowError(TypeError);
      });

      it("should fail validation for any falsy toState value", () => {
        const fromState = {
          name: "settings",
          params: {},
          path: "/settings",
        };
        const navigationOptions: NavigationOptions = {
          forceDeactivate: true,
        };

        expect(() => {
          router.invokeEventListeners(
            events.TRANSITION_SUCCESS,
            // @ts-expect-error - Testing invalid parameters
            "",
            fromState,
            navigationOptions,
          );
        }).toThrowError(TypeError);

        expect(() => {
          router.invokeEventListeners(
            events.TRANSITION_SUCCESS,
            // @ts-expect-error - Testing invalid parameters
            0,
            fromState,
            navigationOptions,
          );
        }).toThrowError(TypeError);
      });

      it("should fail validation even with valid NavigationOptions when toState is missing", () => {
        const validFromState = {
          name: "orders",
          params: {},
          path: "/orders",
        };
        const validNavigationOptions: NavigationOptions = {
          replace: false,
          reload: true,
          force: false,
          redirected: false,
        };

        expect(() => {
          router.invokeEventListeners(
            events.TRANSITION_SUCCESS,
            undefined,
            validFromState,
            validNavigationOptions,
          );
        }).toThrowError(TypeError);
      });

      it("should not log console errors when validation fails before listener execution", () => {
        const fromState = { name: "help", params: {}, path: "/help" };
        const navigationOptions: NavigationOptions = { replace: true };
        const consoleErrorSpy = vi
          .spyOn(console, "error")
          .mockImplementation(() => {});
        const listener = vi.fn();

        router.addEventListener(events.TRANSITION_SUCCESS, listener);

        expect(() => {
          router.invokeEventListeners(
            events.TRANSITION_SUCCESS,
            undefined,
            fromState,
            navigationOptions,
          );
        }).toThrowError(TypeError);

        expect(consoleErrorSpy).not.toHaveBeenCalled();
        expect(listener).not.toHaveBeenCalled();

        consoleErrorSpy.mockRestore();
      });

      it("should prevent any state changes when toState validation fails", () => {
        const fromState = { name: "contact", params: {}, path: "/contact" };
        const navigationOptions: NavigationOptions = { reload: false };
        const initialState = router.getState();

        expect(() => {
          router.invokeEventListeners(
            events.TRANSITION_SUCCESS,
            undefined,
            fromState,
            navigationOptions,
          );
        }).toThrowError(TypeError);

        const stateAfterError = router.getState();

        expect(stateAfterError).toStrictEqual(initialState);
      });
    });

    describe("error when options are missing for TRANSITION_SUCCESS event", () => {
      it("should throw TypeError when arg is undefined", () => {
        const toState = {
          name: "dashboard",
          params: {},
          path: "/dashboard",
        };
        const fromState = { name: "login", params: {}, path: "/login" };
        const undefinedArg = undefined;

        expect(() => {
          router.invokeEventListeners(
            events.TRANSITION_SUCCESS,
            toState,
            fromState,
            undefinedArg,
          );
        }).toThrowError(TypeError);
      });

      it("should fail !arg validation check when arg is undefined", () => {
        const toState = {
          name: "profile",
          params: { id: "123" },
          path: "/profile/123",
        };
        const fromState = { name: "home", params: {}, path: "/home" };
        const undefinedArg = undefined;

        // Verify that !arg check would return true for undefined
        expect(!undefinedArg).toBe(true);

        expect(() => {
          router.invokeEventListeners(
            events.TRANSITION_SUCCESS,
            toState,
            fromState,
            undefinedArg,
          );
        }).toThrowError(TypeError);
      });

      it("should terminate execution at validation stage when arg is missing", () => {
        const toState = { name: "settings", params: {}, path: "/settings" };
        const fromState = { name: "account", params: {}, path: "/account" };
        const consoleErrorSpy = vi
          .spyOn(console, "error")
          .mockImplementation(() => {});
        const listener = vi.fn();

        router.addEventListener(events.TRANSITION_SUCCESS, listener);

        expect(() => {
          router.invokeEventListeners(
            events.TRANSITION_SUCCESS,
            toState,
            fromState,
            undefined,
          );
        }).toThrowError(TypeError);

        // No console errors should be logged since listeners are never called
        expect(consoleErrorSpy).not.toHaveBeenCalled();
        expect(listener).not.toHaveBeenCalled();

        consoleErrorSpy.mockRestore();
      });

      it("should throw TypeError when no arg parameter is provided", () => {
        const toState = { name: "orders", params: {}, path: "/orders" };
        const fromState = { name: "cart", params: {}, path: "/cart" };

        expect(() => {
          router.invokeEventListeners(
            events.TRANSITION_SUCCESS,
            toState,
            fromState,
          );
        }).toThrowError(TypeError);
      });

      it("should not call any listeners when arg validation fails", () => {
        const toState = { name: "help", params: {}, path: "/help" };
        const fromState = { name: "support", params: {}, path: "/support" };
        const listener1 = vi.fn();
        const listener2 = vi.fn();
        const listener3 = vi.fn();

        router.addEventListener(events.TRANSITION_SUCCESS, listener1);
        router.addEventListener(events.TRANSITION_SUCCESS, listener2);
        router.addEventListener(events.TRANSITION_SUCCESS, listener3);

        expect(() => {
          router.invokeEventListeners(
            events.TRANSITION_SUCCESS,
            toState,
            fromState,
            undefined,
          );
        }).toThrowError(TypeError);

        expect(listener1).not.toHaveBeenCalled();
        expect(listener2).not.toHaveBeenCalled();
        expect(listener3).not.toHaveBeenCalled();
      });

      it("should throw TypeError when arg is null", () => {
        const toState = { name: "contact", params: {}, path: "/contact" };
        const fromState = { name: "about", params: {}, path: "/about" };
        const nullArg = null;

        expect(() => {
          router.invokeEventListeners(
            events.TRANSITION_SUCCESS,
            toState,
            fromState,
            // @ts-expect-error - Testing invalid parameters
            nullArg,
          );
        }).toThrowError(TypeError);
      });

      it("should fail validation even with valid toState and fromState when arg is missing", () => {
        const validToState = {
          name: "search",
          params: { query: "test" },
          path: "/search?query=test",
        };
        const validFromState = {
          name: "results",
          params: {},
          path: "/results",
        };

        expect(() => {
          router.invokeEventListeners(
            events.TRANSITION_SUCCESS,
            validToState,
            validFromState,
            undefined,
          );
        }).toThrowError(TypeError);
      });

      it("should prevent any side effects when arg validation fails", () => {
        const toState = {
          name: "account",
          params: { userId: "456" },
          path: "/account/456",
        };
        const fromState = { name: "login", params: {}, path: "/login" };
        const initialState = router.getState();

        expect(() => {
          router.invokeEventListeners(
            events.TRANSITION_SUCCESS,
            toState,
            fromState,
            undefined,
          );
        }).toThrowError(TypeError);

        const stateAfterError = router.getState();

        expect(stateAfterError).toStrictEqual(initialState);
      });
    });

    describe("error when RouterError is passed instead of NavigationOptions", () => {
      it("should throw TypeError when RouterError is passed as arg", () => {
        const toState = {
          name: "dashboard",
          params: {},
          path: "/dashboard",
        };
        const fromState = { name: "login", params: {}, path: "/login" };
        const routerError = new RouterError("ROUTE_NOT_FOUND", {
          message: "Route not found",
        });
        const expectedErrorMessage =
          '[router.invokeEventListeners] options cannot be a RouterError for event "$$success"';

        expect(() => {
          router.invokeEventListeners(
            events.TRANSITION_SUCCESS,
            toState,
            fromState,
            routerError,
          );
        }).toThrowError(TypeError);

        expect(() => {
          router.invokeEventListeners(
            events.TRANSITION_SUCCESS,
            toState,
            fromState,
            routerError,
          );
        }).toThrowError(expectedErrorMessage);
      });

      it("should fail instanceof RouterError validation check", () => {
        const toState = {
          name: "profile",
          params: { id: "123" },
          path: "/profile/123",
        };
        const fromState = { name: "home", params: {}, path: "/home" };
        const routerError = new RouterError("CANNOT_ACTIVATE", {
          message: "Cannot activate route",
        });

        // Verify that instanceof RouterError check would return true
        expect(routerError instanceof RouterError).toBe(true);

        // But this should still fail validation because RouterError is not allowed for TRANSITION_SUCCESS
        expect(() => {
          router.invokeEventListeners(
            events.TRANSITION_SUCCESS,
            toState,
            fromState,
            routerError,
          );
        }).toThrowError(TypeError);
      });

      it("should not call listeners due to incorrect argument type", () => {
        const toState = { name: "settings", params: {}, path: "/settings" };
        const fromState = { name: "account", params: {}, path: "/account" };
        const routerError = new RouterError("TRANSITION_ERR", {
          message: "Transition error",
        });
        const listener1 = vi.fn();
        const listener2 = vi.fn();
        const listener3 = vi.fn();

        router.addEventListener(events.TRANSITION_SUCCESS, listener1);
        router.addEventListener(events.TRANSITION_SUCCESS, listener2);
        router.addEventListener(events.TRANSITION_SUCCESS, listener3);

        expect(() => {
          router.invokeEventListeners(
            events.TRANSITION_SUCCESS,
            toState,
            fromState,
            routerError,
          );
        }).toThrowError(TypeError);

        expect(listener1).not.toHaveBeenCalled();
        expect(listener2).not.toHaveBeenCalled();
        expect(listener3).not.toHaveBeenCalled();
      });

      it("should reject RouterError with different error codes", () => {
        const toState = { name: "orders", params: {}, path: "/orders" };
        const fromState = { name: "cart", params: {}, path: "/cart" };
        const expectedErrorMessage =
          '[router.invokeEventListeners] options cannot be a RouterError for event "$$success"';

        const routerError1 = new RouterError("CANNOT_DEACTIVATE", {
          message: "Cannot deactivate",
        });
        const routerError2 = new RouterError("SAME_STATES", {
          message: "Same states",
        });
        const routerError3 = new RouterError("TIMEOUT", {
          message: "Timeout occurred",
        });

        expect(() => {
          router.invokeEventListeners(
            events.TRANSITION_SUCCESS,
            toState,
            fromState,
            routerError1,
          );
        }).toThrowError(expectedErrorMessage);

        expect(() => {
          router.invokeEventListeners(
            events.TRANSITION_SUCCESS,
            toState,
            fromState,
            routerError2,
          );
        }).toThrowError(expectedErrorMessage);

        expect(() => {
          router.invokeEventListeners(
            events.TRANSITION_SUCCESS,
            toState,
            fromState,
            routerError3,
          );
        }).toThrowError(expectedErrorMessage);
      });

      it("should reject RouterError even with custom properties", () => {
        const toState = { name: "help", params: {}, path: "/help" };
        const fromState = { name: "support", params: {}, path: "/support" };
        const routerError = new RouterError("CUSTOM_ERROR", {
          message: "Custom error",
          customProperty: "customValue",
          metadata: { timestamp: Date.now() },
        });
        const expectedErrorMessage =
          '[router.invokeEventListeners] options cannot be a RouterError for event "$$success"';

        expect(() => {
          router.invokeEventListeners(
            events.TRANSITION_SUCCESS,
            toState,
            fromState,
            routerError,
          );
        }).toThrowError(TypeError);

        expect(() => {
          router.invokeEventListeners(
            events.TRANSITION_SUCCESS,
            toState,
            fromState,
            routerError,
          );
        }).toThrowError(expectedErrorMessage);
      });

      it("should not log console errors when validation fails before listener execution", () => {
        const toState = { name: "contact", params: {}, path: "/contact" };
        const fromState = { name: "about", params: {}, path: "/about" };
        const routerError = new RouterError("VALIDATION_ERROR", {
          message: "Validation failed",
        });
        const consoleErrorSpy = vi
          .spyOn(console, "error")
          .mockImplementation(() => {});
        const listener = vi.fn();

        router.addEventListener(events.TRANSITION_SUCCESS, listener);

        expect(() => {
          router.invokeEventListeners(
            events.TRANSITION_SUCCESS,
            toState,
            fromState,
            routerError,
          );
        }).toThrowError(TypeError);

        expect(consoleErrorSpy).not.toHaveBeenCalled();
        expect(listener).not.toHaveBeenCalled();

        consoleErrorSpy.mockRestore();
      });

      it("should distinguish between RouterError and NavigationOptions validation", () => {
        const toState = {
          name: "search",
          params: { query: "test" },
          path: "/search?query=test",
        };
        const fromState = { name: "results", params: {}, path: "/results" };
        const routerError = new RouterError("TEST_ERROR", {
          message: "Test error",
        });
        const validNavigationOptions: NavigationOptions = {
          replace: false,
          reload: true,
        };

        // RouterError should fail
        expect(() => {
          router.invokeEventListeners(
            events.TRANSITION_SUCCESS,
            toState,
            fromState,
            routerError,
          );
        }).toThrowError(TypeError);

        // NavigationOptions should succeed
        expect(() => {
          router.invokeEventListeners(
            events.TRANSITION_SUCCESS,
            toState,
            fromState,
            validNavigationOptions,
          );
        }).not.toThrowError();
      });

      it("should prevent any side effects when RouterError validation fails", () => {
        const toState = {
          name: "account",
          params: { userId: "789" },
          path: "/account/789",
        };
        const fromState = { name: "login", params: {}, path: "/login" };
        const routerError = new RouterError("ACCESS_DENIED", {
          message: "Access denied",
        });
        const initialState = router.getState();

        expect(() => {
          router.invokeEventListeners(
            events.TRANSITION_SUCCESS,
            toState,
            fromState,
            routerError,
          );
        }).toThrowError(TypeError);

        const stateAfterError = router.getState();

        expect(stateAfterError).toStrictEqual(initialState);
      });
    });

    describe("error when primitive value is passed as options argument", () => {
      it("should throw TypeError when string is passed as arg", () => {
        const toState = {
          name: "dashboard",
          params: {},
          path: "/dashboard",
        };
        const fromState = { name: "login", params: {}, path: "/login" };
        const stringArg = "string";

        expect(() => {
          router.invokeEventListeners(
            events.TRANSITION_SUCCESS,
            toState,
            fromState,
            // @ts-expect-error - Testing invalid parameters
            stringArg,
          );
        }).toThrowError(TypeError);
      });

      it("should fail typeof object validation check for primitive types", () => {
        const toState = {
          name: "profile",
          params: { id: "123" },
          path: "/profile/123",
        };
        const fromState = { name: "home", params: {}, path: "/home" };
        const stringArg = "test string";
        const numberArg = 42;
        const booleanArg = true;

        // Verify that typeof checks would fail for primitives
        expectTypeOf(stringArg).not.toBeObject();
        expectTypeOf(numberArg).not.toBeObject();
        expectTypeOf(booleanArg).not.toBeObject();

        expect(() => {
          router.invokeEventListeners(
            events.TRANSITION_SUCCESS,
            toState,
            fromState,
            // @ts-expect-error - Testing invalid parameters
            stringArg,
          );
        }).toThrowError(TypeError);
      });

      it("should terminate execution at type validation stage for primitives", () => {
        const toState = { name: "settings", params: {}, path: "/settings" };
        const fromState = { name: "account", params: {}, path: "/account" };
        const primitiveArg = "primitive value";
        const consoleErrorSpy = vi
          .spyOn(console, "error")
          .mockImplementation(() => {});
        const listener = vi.fn();

        router.addEventListener(events.TRANSITION_SUCCESS, listener);

        expect(() => {
          router.invokeEventListeners(
            events.TRANSITION_SUCCESS,
            toState,
            fromState,
            // @ts-expect-error - Testing invalid parameters
            primitiveArg,
          );
        }).toThrowError(TypeError);

        // No console errors should be logged since listeners are never called
        expect(consoleErrorSpy).not.toHaveBeenCalled();
        expect(listener).not.toHaveBeenCalled();

        consoleErrorSpy.mockRestore();
      });

      it("should reject number primitive as options argument", () => {
        const toState = { name: "orders", params: {}, path: "/orders" };
        const fromState = { name: "cart", params: {}, path: "/cart" };
        const numberArg = 123;

        expect(() => {
          router.invokeEventListeners(
            events.TRANSITION_SUCCESS,
            toState,
            fromState,
            // @ts-expect-error - Testing invalid parameters
            numberArg,
          );
        }).toThrowError(TypeError);
      });

      it("should reject boolean primitive as options argument", () => {
        const toState = { name: "help", params: {}, path: "/help" };
        const fromState = { name: "support", params: {}, path: "/support" };
        const booleanArg = false;

        expect(() => {
          router.invokeEventListeners(
            events.TRANSITION_SUCCESS,
            toState,
            fromState,
            // @ts-expect-error - Testing invalid parameters
            booleanArg,
          );
        }).toThrowError(TypeError);
      });

      it("should reject symbol primitive as options argument", () => {
        const toState = { name: "contact", params: {}, path: "/contact" };
        const fromState = { name: "about", params: {}, path: "/about" };
        const symbolArg = Symbol("test");

        expect(() => {
          router.invokeEventListeners(
            events.TRANSITION_SUCCESS,
            toState,
            fromState,
            // @ts-expect-error - Testing invalid parameters
            symbolArg,
          );
        }).toThrowError(TypeError);
      });

      it("should not call any listeners when primitive validation fails", () => {
        const toState = {
          name: "search",
          params: { query: "test" },
          path: "/search?query=test",
        };
        const fromState = { name: "results", params: {}, path: "/results" };
        const primitiveArg = "invalid primitive";
        const listener1 = vi.fn();
        const listener2 = vi.fn();

        router.addEventListener(events.TRANSITION_SUCCESS, listener1);
        router.addEventListener(events.TRANSITION_SUCCESS, listener2);

        expect(() => {
          router.invokeEventListeners(
            events.TRANSITION_SUCCESS,
            toState,
            fromState,
            // @ts-expect-error - Testing invalid parameters
            primitiveArg,
          );
        }).toThrowError(TypeError);

        expect(listener1).not.toHaveBeenCalled();
        expect(listener2).not.toHaveBeenCalled();
      });

      it("should reject empty string as options argument", () => {
        const toState = {
          name: "account",
          params: { userId: "456" },
          path: "/account/456",
        };
        const fromState = { name: "login", params: {}, path: "/login" };
        const emptyString = "";

        expect(() => {
          router.invokeEventListeners(
            events.TRANSITION_SUCCESS,
            toState,
            fromState,
            // @ts-expect-error - Testing invalid parameters
            emptyString,
          );
        }).toThrowError(TypeError);
      });

      it("should distinguish between primitive and object validation", () => {
        const toState = { name: "admin", params: {}, path: "/admin" };
        const fromState = {
          name: "dashboard",
          params: {},
          path: "/dashboard",
        };
        const primitiveArg = "string primitive";
        const validObjectArg: NavigationOptions = { replace: true };

        // Primitive should fail
        expect(() => {
          router.invokeEventListeners(
            events.TRANSITION_SUCCESS,
            toState,
            fromState,
            // @ts-expect-error - Testing invalid parameters
            primitiveArg,
          );
        }).toThrowError(TypeError);

        // Valid object should succeed
        expect(() => {
          router.invokeEventListeners(
            events.TRANSITION_SUCCESS,
            toState,
            fromState,
            validObjectArg,
          );
        }).not.toThrowError();
      });

      it("should prevent any side effects when primitive validation fails", () => {
        const toState = { name: "reports", params: {}, path: "/reports" };
        const fromState = {
          name: "analytics",
          params: {},
          path: "/analytics",
        };
        const primitiveArg = 999;
        const initialState = router.getState();

        expect(() => {
          router.invokeEventListeners(
            events.TRANSITION_SUCCESS,
            toState,
            fromState,
            // @ts-expect-error - Testing invalid parameters
            primitiveArg,
          );
        }).toThrowError(TypeError);

        const stateAfterError = router.getState();

        expect(stateAfterError).toStrictEqual(initialState);
      });
    });

    describe("error when null is passed as options for TRANSITION_SUCCESS", () => {
      it("should throw TypeError when null is passed as arg", () => {
        const toState = {
          name: "dashboard",
          params: {},
          path: "/dashboard",
        };
        const fromState = { name: "login", params: {}, path: "/login" };
        const nullArg = null;

        expect(() => {
          router.invokeEventListeners(
            events.TRANSITION_SUCCESS,
            toState,
            fromState,
            // @ts-expect-error - Testing invalid parameters
            nullArg,
          );
        }).toThrowError(TypeError);
      });

      it("should fail !arg validation check for null argument", () => {
        const toState = {
          name: "profile",
          params: { id: "123" },
          path: "/profile/123",
        };
        const fromState = { name: "home", params: {}, path: "/home" };
        const nullArg = null;

        expect(() => {
          router.invokeEventListeners(
            events.TRANSITION_SUCCESS,
            toState,
            fromState,
            // @ts-expect-error - Testing invalid parameters
            nullArg,
          );
        }).toThrowError(TypeError);
      });

      it("should not reach object type validation when null validation fails", () => {
        const toState = { name: "settings", params: {}, path: "/settings" };
        const fromState = { name: "account", params: {}, path: "/account" };
        const nullArg = null;

        // Note: typeof null === "object" in JavaScript, but !arg check comes first
        expect(typeof nullArg).toBe("object"); // null is typeof "object" in JS

        expect(!nullArg).toBe(true);

        expect(() => {
          router.invokeEventListeners(
            events.TRANSITION_SUCCESS,
            toState,
            fromState,
            // @ts-expect-error - Testing invalid parameters
            nullArg,
          );
        }).toThrowError(TypeError);
      });

      it("should not call any listeners when null validation fails", () => {
        const toState = { name: "orders", params: {}, path: "/orders" };
        const fromState = { name: "cart", params: {}, path: "/cart" };
        const nullArg = null;
        const listener1 = vi.fn();
        const listener2 = vi.fn();
        const listener3 = vi.fn();

        router.addEventListener(events.TRANSITION_SUCCESS, listener1);
        router.addEventListener(events.TRANSITION_SUCCESS, listener2);
        router.addEventListener(events.TRANSITION_SUCCESS, listener3);

        expect(() => {
          router.invokeEventListeners(
            events.TRANSITION_SUCCESS,
            toState,
            fromState,
            // @ts-expect-error - Testing invalid parameters
            nullArg,
          );
        }).toThrowError(TypeError);

        expect(listener1).not.toHaveBeenCalled();
        expect(listener2).not.toHaveBeenCalled();
        expect(listener3).not.toHaveBeenCalled();
      });

      it("should terminate execution at early validation stage with null", () => {
        const toState = { name: "help", params: {}, path: "/help" };
        const fromState = { name: "support", params: {}, path: "/support" };
        const nullArg = null;
        const consoleErrorSpy = vi
          .spyOn(console, "error")
          .mockImplementation(() => {});
        const listener = vi.fn();

        router.addEventListener(events.TRANSITION_SUCCESS, listener);

        expect(() => {
          router.invokeEventListeners(
            events.TRANSITION_SUCCESS,
            toState,
            fromState,
            // @ts-expect-error - Testing invalid parameters
            nullArg,
          );
        }).toThrowError(TypeError);

        // No console errors should be logged since listeners are never called
        expect(consoleErrorSpy).not.toHaveBeenCalled();
        expect(listener).not.toHaveBeenCalled();

        consoleErrorSpy.mockRestore();
      });

      it("should fail validation even with valid toState and fromState when arg is null", () => {
        const validToState = {
          name: "contact",
          params: {},
          path: "/contact",
        };
        const validFromState = {
          name: "about",
          params: {},
          path: "/about",
        };
        const nullArg = null;

        expect(() => {
          router.invokeEventListeners(
            events.TRANSITION_SUCCESS,
            validToState,
            validFromState,
            // @ts-expect-error - Testing invalid parameters
            nullArg,
          );
        }).toThrowError(TypeError);
      });

      it("should handle null differently from valid objects in validation", () => {
        const toState = {
          name: "search",
          params: { query: "test" },
          path: "/search?query=test",
        };
        const fromState = { name: "results", params: {}, path: "/results" };
        const nullArg = null;
        const validObjectArg: NavigationOptions = {};

        // null should fail validation
        expect(() => {
          router.invokeEventListeners(
            events.TRANSITION_SUCCESS,
            toState,
            fromState,
            // @ts-expect-error - Testing invalid parameters
            nullArg,
          );
        }).toThrowError();

        // Valid empty object should succeed
        expect(() => {
          router.invokeEventListeners(
            events.TRANSITION_SUCCESS,
            toState,
            fromState,
            validObjectArg,
          );
        }).not.toThrowError();
      });

      it("should distinguish null from undefined in validation behavior", () => {
        const toState = {
          name: "account",
          params: { userId: "789" },
          path: "/account/789",
        };
        const fromState = { name: "login", params: {}, path: "/login" };
        const nullArg = null;
        const undefinedArg = undefined;

        // Both null and undefined should fail with the same error
        expect(() => {
          router.invokeEventListeners(
            events.TRANSITION_SUCCESS,
            toState,
            fromState,
            // @ts-expect-error - Testing invalid parameters
            nullArg,
          );
        }).toThrowError();

        expect(() => {
          router.invokeEventListeners(
            events.TRANSITION_SUCCESS,
            toState,
            fromState,
            undefinedArg,
          );
        }).toThrowError();
      });

      it("should prevent any side effects when null validation fails", () => {
        const toState = { name: "admin", params: {}, path: "/admin" };
        const fromState = {
          name: "dashboard",
          params: {},
          path: "/dashboard",
        };
        const nullArg = null;
        const initialState = router.getState();

        expect(() => {
          router.invokeEventListeners(
            events.TRANSITION_SUCCESS,
            toState,
            fromState,
            // @ts-expect-error - Testing invalid parameters
            nullArg,
          );
        }).toThrowError(TypeError);

        const stateAfterError = router.getState();

        expect(stateAfterError).toStrictEqual(initialState);
      });
    });
  });
});
