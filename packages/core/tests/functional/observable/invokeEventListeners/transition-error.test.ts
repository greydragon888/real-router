import { logger } from "logger";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { events, RouterError } from "@real-router/core";

import { createTestRouter } from "../../../helpers";

import type { Router, State } from "@real-router/core";

let router: Router;
const noop = () => undefined;

describe("invokeEventListeners - TRANSITION_ERROR event", () => {
  beforeEach(() => {
    router = createTestRouter();

    router.start();
  });

  afterEach(() => {
    router.stop();
  });

  describe("validation of TRANSITION_ERROR event", () => {
    describe("successful TRANSITION_ERROR event call with correct RouterError", () => {
      it("should execute successfully with valid RouterError instance", () => {
        const toState = {
          name: "profile",
          params: { id: "123" },
          path: "/profile/123",
        };
        const fromState = { name: "home", params: {}, path: "/home" };
        const routerError = new RouterError("ROUTE_NOT_FOUND", {
          message: "Route not found",
          path: "/invalid-path",
        });

        expect(() => {
          router.invokeEventListeners(
            events.TRANSITION_ERROR,
            toState,
            fromState,
            routerError,
          );
        }).not.toThrowError();
      });

      it("should call listeners with all three parameters: toState, fromState, routerError", () => {
        const toState = {
          name: "dashboard",
          params: {},
          path: "/dashboard",
        };
        const fromState = { name: "login", params: {}, path: "/login" };
        const routerError = new RouterError("CANNOT_ACTIVATE", {
          message: "Cannot activate route",
          segment: "dashboard",
        });
        const listener = vi.fn();

        router.addEventListener(events.TRANSITION_ERROR, listener);

        router.invokeEventListeners(
          events.TRANSITION_ERROR,
          toState,
          fromState,
          routerError,
        );

        expect(listener).toHaveBeenCalledWith(toState, fromState, routerError);
        expect(listener).toHaveBeenCalledTimes(1);
      });

      it("should pass RouterError as last argument in unchanged form", () => {
        const toState = { name: "settings", params: {}, path: "/settings" };
        const fromState = { name: "profile", params: {}, path: "/profile" };
        const originalErrorCode = "TRANSITION_ERR";
        const originalErrorMessage = "Transition failed due to middleware";
        const routerError = new RouterError(originalErrorCode, {
          message: originalErrorMessage,
          path: "/settings",
        });
        const listener = vi.fn();

        router.addEventListener(events.TRANSITION_ERROR, listener);

        router.invokeEventListeners(
          events.TRANSITION_ERROR,
          toState,
          fromState,
          routerError,
        );

        const receivedError = listener.mock.calls[0][2];

        expect(receivedError).toBe(routerError);
        expect(receivedError.code).toBe(originalErrorCode);
        expect(receivedError.message).toBe(originalErrorMessage);
      });

      it("should handle error processing according to listener logic", () => {
        const toState: State = { name: "cart", params: {}, path: "/cart" };
        const fromState: State = {
          name: "products",
          params: {},
          path: "/products",
        };
        const routerError = new RouterError("CANNOT_DEACTIVATE", {
          message: "Cannot leave products page",
          segment: "products",
        });
        const errorHandlingResults: string[] = [];

        const listener1 = vi.fn(
          (_toState?: State, _fromState?: State, error?: RouterError) => {
            if (error) {
              errorHandlingResults.push(`Handled error: ${error.code}`);
            }
          },
        );

        const listener2 = vi.fn(
          (_toState?: State, _fromState?: State, error?: RouterError) => {
            if (error) {
              errorHandlingResults.push(`Logged error: ${error.message}`);
            }
          },
        );

        router.addEventListener(events.TRANSITION_ERROR, listener1);
        router.addEventListener(events.TRANSITION_ERROR, listener2);

        router.invokeEventListeners(
          events.TRANSITION_ERROR,
          toState,
          fromState,
          routerError,
        );

        expect(listener1).toHaveBeenCalledWith(toState, fromState, routerError);
        expect(listener2).toHaveBeenCalledWith(toState, fromState, routerError);
        expect(errorHandlingResults).toStrictEqual([
          "Handled error: CANNOT_DEACTIVATE",
          "Logged error: Cannot leave products page",
        ]);
      });

      it("should work with RouterError containing additional custom fields", () => {
        const toState = { name: "orders", params: {}, path: "/orders" };
        const fromState = { name: "account", params: {}, path: "/account" };
        const routerError = new RouterError("CUSTOM_ERROR", {
          message: "Custom validation failed",
          customField: "customValue",
          errorData: { timestamp: Date.now(), severity: "high" },
        });
        const listener = vi.fn();

        router.addEventListener(events.TRANSITION_ERROR, listener);

        router.invokeEventListeners(
          events.TRANSITION_ERROR,
          toState,
          fromState,
          routerError,
        );

        const receivedError = listener.mock.calls[0][2];

        expect(receivedError.customField).toBe("customValue");
        expect(receivedError.errorData).toStrictEqual({
          timestamp: expect.any(Number),
          severity: "high",
        });
      });

      it("should handle multiple listeners receiving the same RouterError instance", () => {
        const toState = { name: "help", params: {}, path: "/help" };
        const fromState = { name: "support", params: {}, path: "/support" };
        const routerError = new RouterError("TIMEOUT", {
          message: "Request timeout",
          timeout: 5000,
        });
        const listener1 = vi.fn();
        const listener2 = vi.fn();
        const listener3 = vi.fn();

        router.addEventListener(events.TRANSITION_ERROR, listener1);
        router.addEventListener(events.TRANSITION_ERROR, listener2);
        router.addEventListener(events.TRANSITION_ERROR, listener3);

        router.invokeEventListeners(
          events.TRANSITION_ERROR,
          toState,
          fromState,
          routerError,
        );

        expect(listener1).toHaveBeenCalledWith(toState, fromState, routerError);
        expect(listener2).toHaveBeenCalledWith(toState, fromState, routerError);
        expect(listener3).toHaveBeenCalledWith(toState, fromState, routerError);

        // All listeners should receive the same error instance
        expect(listener1.mock.calls[0][2]).toBe(routerError);
        expect(listener2.mock.calls[0][2]).toBe(routerError);
        expect(listener3.mock.calls[0][2]).toBe(routerError);
      });
    });

    describe("error when argument is missing for TRANSITION_ERROR event", () => {
      it("should throw TypeError with correct message when arg is undefined", () => {
        const toState = {
          name: "profile",
          params: { id: "123" },
          path: "/profile/123",
        };
        const fromState = {
          name: "dashboard",
          params: {},
          path: "/dashboard",
        };

        expect(() => {
          router.invokeEventListeners(
            events.TRANSITION_ERROR,
            toState,
            fromState,
            undefined,
          );
        }).toThrowError(TypeError);
      });

      it("should not call any event listeners when arg validation fails", () => {
        const toState = { name: "settings", params: {}, path: "/settings" };
        const fromState = { name: "home", params: {}, path: "/home" };
        const listener1 = vi.fn();
        const listener2 = vi.fn();
        const listener3 = vi.fn();

        router.addEventListener(events.TRANSITION_ERROR, listener1);
        router.addEventListener(events.TRANSITION_ERROR, listener2);
        router.addEventListener(events.TRANSITION_ERROR, listener3);

        expect(() => {
          router.invokeEventListeners(
            events.TRANSITION_ERROR,
            toState,
            fromState,
            undefined,
          );
        }).toThrowError(TypeError);

        expect(listener1).not.toHaveBeenCalled();
        expect(listener2).not.toHaveBeenCalled();
        expect(listener3).not.toHaveBeenCalled();
      });

      it("should terminate execution at validation stage when arg is missing", () => {
        const toState = { name: "orders", params: {}, path: "/orders" };
        const fromState = { name: "cart", params: {}, path: "/cart" };
        const consoleErrorSpy = vi
          .spyOn(logger, "error")
          .mockImplementation(noop);
        const listener = vi.fn();

        router.addEventListener(events.TRANSITION_ERROR, listener);

        expect(() => {
          router.invokeEventListeners(
            events.TRANSITION_ERROR,
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

      it("should throw TypeError when arg is null", () => {
        const toState = { name: "help", params: {}, path: "/help" };
        const fromState = { name: "support", params: {}, path: "/support" };

        expect(() => {
          router.invokeEventListeners(
            events.TRANSITION_ERROR,
            toState,
            fromState,
            // @ts-expect-error - Testing invalid parameters
            null,
          );
        }).toThrowError(TypeError);
      });

      it("should throw TypeError when no arg parameter is provided", () => {
        const toState = { name: "contact", params: {}, path: "/contact" };
        const fromState = { name: "about", params: {}, path: "/about" };

        expect(() => {
          router.invokeEventListeners(
            events.TRANSITION_ERROR,
            toState,
            fromState,
          );
        }).toThrowError(TypeError);
      });

      it("should throw TypeError for any falsy arg value", () => {
        const toState = { name: "search", params: {}, path: "/search" };
        const fromState = { name: "results", params: {}, path: "/results" };

        expect(() => {
          router.invokeEventListeners(
            events.TRANSITION_ERROR,
            toState,
            fromState,
            // @ts-expect-error - Testing invalid parameters
            "",
          );
        }).toThrowError(TypeError);

        expect(() => {
          router.invokeEventListeners(
            events.TRANSITION_ERROR,
            toState,
            fromState,
            // @ts-expect-error - Testing invalid parameters
            0,
          );
        }).toThrowError(TypeError);
      });

      it("should fail validation even when toState and fromState are valid", () => {
        const validToState = {
          name: "account",
          params: { userId: "456" },
          path: "/account/456",
        };
        const validFromState = {
          name: "login",
          params: {},
          path: "/login",
        };
        const listener = vi.fn();

        router.addEventListener(events.TRANSITION_ERROR, listener);

        expect(() => {
          router.invokeEventListeners(
            events.TRANSITION_ERROR,
            validToState,
            validFromState,
            undefined,
          );
        }).toThrowError(TypeError);

        expect(listener).not.toHaveBeenCalled();
      });
    });

    describe("error when incorrect argument type is provided for TRANSITION_ERROR event", () => {
      it("should throw TypeError when regular Error is passed instead of RouterError", () => {
        const toState = {
          name: "dashboard",
          params: {},
          path: "/dashboard",
        };
        const fromState = { name: "login", params: {}, path: "/login" };
        const regularError = new Error("test");

        expect(() => {
          router.invokeEventListeners(
            events.TRANSITION_ERROR,
            toState,
            fromState,
            // @ts-expect-error - Testing invalid parameters
            regularError,
          );
        }).toThrowError(TypeError);
      });

      it("should fail instanceof RouterError check for regular Error objects", () => {
        const toState = {
          name: "profile",
          params: { id: "123" },
          path: "/profile/123",
        };
        const fromState = { name: "home", params: {}, path: "/home" };
        const regularError = new Error("Regular error message");

        // Verify that instanceof check would fail
        expect(regularError instanceof RouterError).toBe(false);

        expect(() => {
          router.invokeEventListeners(
            events.TRANSITION_ERROR,
            toState,
            fromState,
            // @ts-expect-error - Testing invalid parameters
            regularError,
          );
        }).toThrowError(TypeError);
      });

      it("should terminate execution at type validation stage", () => {
        const toState = { name: "settings", params: {}, path: "/settings" };
        const fromState = { name: "account", params: {}, path: "/account" };
        const regularError = new Error("Validation test error");
        const consoleErrorSpy = vi
          .spyOn(logger, "error")
          .mockImplementation(() => {});
        const listener = vi.fn();

        router.addEventListener(events.TRANSITION_ERROR, listener);

        expect(() => {
          router.invokeEventListeners(
            events.TRANSITION_ERROR,
            toState,
            fromState,
            // @ts-expect-error - Testing invalid parameters
            regularError,
          );
        }).toThrowError(TypeError);

        // No console errors should be logged since listeners are never called
        expect(consoleErrorSpy).not.toHaveBeenCalled();
        expect(listener).not.toHaveBeenCalled();

        consoleErrorSpy.mockRestore();
      });

      it("should reject custom error objects that are not RouterError instances", () => {
        const toState = { name: "orders", params: {}, path: "/orders" };
        const fromState = { name: "cart", params: {}, path: "/cart" };
        const customError = {
          name: "CustomError",
          message: "Custom error message",
          code: "CUSTOM_CODE",
        };

        expect(() => {
          router.invokeEventListeners(
            events.TRANSITION_ERROR,
            toState,
            fromState,
            customError,
          );
        }).toThrowError(TypeError);
      });

      it("should reject NavigationOptions object passed as error argument", () => {
        const toState = { name: "help", params: {}, path: "/help" };
        const fromState = { name: "support", params: {}, path: "/support" };
        const navigationOptions = { replace: true, reload: false };

        expect(() => {
          router.invokeEventListeners(
            events.TRANSITION_ERROR,
            toState,
            fromState,
            navigationOptions,
          );
        }).toThrowError(TypeError);
      });

      it("should reject primitive values as error argument", () => {
        const toState = { name: "contact", params: {}, path: "/contact" };
        const fromState = { name: "about", params: {}, path: "/about" };

        expect(() => {
          router.invokeEventListeners(
            events.TRANSITION_ERROR,
            toState,
            fromState,
            // @ts-expect-error - Testing invalid parameters
            "string error",
          );
        }).toThrowError(TypeError);

        expect(() => {
          router.invokeEventListeners(
            events.TRANSITION_ERROR,
            toState,
            fromState,
            // @ts-expect-error - Testing invalid parameters
            404,
          );
        }).toThrowError(TypeError);
      });

      it("should not call any listeners when type validation fails", () => {
        const toState = {
          name: "search",
          params: { query: "test" },
          path: "/search?query=test",
        };
        const fromState = { name: "results", params: {}, path: "/results" };
        const regularError = new Error("Type validation test");
        const listener1 = vi.fn();
        const listener2 = vi.fn();

        router.addEventListener(events.TRANSITION_ERROR, listener1);
        router.addEventListener(events.TRANSITION_ERROR, listener2);

        expect(() => {
          router.invokeEventListeners(
            events.TRANSITION_ERROR,
            toState,
            fromState,
            // @ts-expect-error - Testing invalid parameters
            regularError,
          );
        }).toThrowError(TypeError);

        expect(listener1).not.toHaveBeenCalled();
        expect(listener2).not.toHaveBeenCalled();
      });
    });

    describe("error when string is passed instead of RouterError", () => {
      it("should throw TypeError when string is passed as error argument", () => {
        const toState = {
          name: "profile",
          params: { id: "456" },
          path: "/profile/456",
        };
        const fromState = {
          name: "dashboard",
          params: {},
          path: "/dashboard",
        };
        const errorMessage = "error message";

        expect(() => {
          router.invokeEventListeners(
            events.TRANSITION_ERROR,
            toState,
            fromState,
            // @ts-expect-error - Testing invalid parameters
            errorMessage,
          );
        }).toThrowError(TypeError);
      });

      it("should fail instanceof RouterError validation for string arguments", () => {
        const toState = { name: "settings", params: {}, path: "/settings" };
        const fromState = { name: "home", params: {}, path: "/home" };
        const stringError = "Route not found";

        // Verify that instanceof check would fail for string
        // @ts-expect-error - Testing invalid parameters
        expect(stringError instanceof RouterError).toBe(false);

        expect(() => {
          router.invokeEventListeners(
            events.TRANSITION_ERROR,
            toState,
            fromState,
            // @ts-expect-error - Testing invalid parameters
            stringError,
          );
        }).toThrowError(TypeError);
      });

      it("should not notify any listeners when string validation fails", () => {
        const toState = { name: "orders", params: {}, path: "/orders" };
        const fromState = { name: "cart", params: {}, path: "/cart" };
        const stringError = "Cannot process order";
        const listener1 = vi.fn();
        const listener2 = vi.fn();
        const listener3 = vi.fn();

        router.addEventListener(events.TRANSITION_ERROR, listener1);
        router.addEventListener(events.TRANSITION_ERROR, listener2);
        router.addEventListener(events.TRANSITION_ERROR, listener3);

        expect(() => {
          router.invokeEventListeners(
            events.TRANSITION_ERROR,
            toState,
            fromState,
            // @ts-expect-error - Testing invalid parameters
            stringError,
          );
        }).toThrowError(TypeError);

        expect(listener1).not.toHaveBeenCalled();
        expect(listener2).not.toHaveBeenCalled();
        expect(listener3).not.toHaveBeenCalled();
      });

      it("should reject empty string as error argument", () => {
        const toState = { name: "help", params: {}, path: "/help" };
        const fromState = { name: "support", params: {}, path: "/support" };
        const emptyString = "";

        expect(() => {
          router.invokeEventListeners(
            events.TRANSITION_ERROR,
            toState,
            fromState,
            // @ts-expect-error - Testing invalid parameters
            emptyString,
          );
        }).toThrowError(TypeError);
      });

      it("should reject multi-line string error messages", () => {
        const toState = { name: "contact", params: {}, path: "/contact" };
        const fromState = { name: "about", params: {}, path: "/about" };
        const multiLineError = "Line 1\nLine 2\nLine 3";

        expect(() => {
          router.invokeEventListeners(
            events.TRANSITION_ERROR,
            toState,
            fromState,
            // @ts-expect-error - Testing invalid parameters
            multiLineError,
          );
        }).toThrowError(TypeError);
      });

      it("should reject JSON string as error argument", () => {
        const toState = {
          name: "search",
          params: { query: "test" },
          path: "/search?query=test",
        };
        const fromState = { name: "results", params: {}, path: "/results" };
        const jsonError =
          '{"code": "ERROR", "message": "Something went wrong"}';

        expect(() => {
          router.invokeEventListeners(
            events.TRANSITION_ERROR,
            toState,
            fromState,
            // @ts-expect-error - Testing invalid parameters
            jsonError,
          );
        }).toThrowError(TypeError);
      });

      it("should not log console errors when validation fails before listener execution", () => {
        const toState = {
          name: "account",
          params: { userId: "789" },
          path: "/account/789",
        };
        const fromState = { name: "login", params: {}, path: "/login" };
        const stringError = "Account access denied";
        const consoleErrorSpy = vi
          .spyOn(logger, "error")
          .mockImplementation(() => {});
        const listener = vi.fn();

        router.addEventListener(events.TRANSITION_ERROR, listener);

        expect(() => {
          router.invokeEventListeners(
            events.TRANSITION_ERROR,
            toState,
            fromState,
            // @ts-expect-error - Testing invalid parameters
            stringError,
          );
        }).toThrowError(TypeError);

        expect(consoleErrorSpy).not.toHaveBeenCalled();
        expect(listener).not.toHaveBeenCalled();

        consoleErrorSpy.mockRestore();
      });
    });

    describe("TRANSITION_ERROR call with null as error argument", () => {
      it("should throw TypeError when null is passed as error argument", () => {
        const toState = {
          name: "dashboard",
          params: {},
          path: "/dashboard",
        };
        const fromState = { name: "login", params: {}, path: "/login" };
        const nullError = null;

        expect(() => {
          router.invokeEventListeners(
            events.TRANSITION_ERROR,
            toState,
            fromState,
            // @ts-expect-error - Testing invalid parameters
            nullError,
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
        const nullError = null;

        // Verify that !arg check would return true for null
        expect(!nullError).toBe(true);

        expect(() => {
          router.invokeEventListeners(
            events.TRANSITION_ERROR,
            toState,
            fromState,
            // @ts-expect-error - Testing invalid parameters
            nullError,
          );
        }).toThrowError(TypeError);
      });

      it("should not reach listener invocation when null validation fails", () => {
        const toState = { name: "settings", params: {}, path: "/settings" };
        const fromState = { name: "account", params: {}, path: "/account" };
        const nullError = null;
        const listener1 = vi.fn();
        const listener2 = vi.fn();

        router.addEventListener(events.TRANSITION_ERROR, listener1);
        router.addEventListener(events.TRANSITION_ERROR, listener2);

        expect(() => {
          router.invokeEventListeners(
            events.TRANSITION_ERROR,
            toState,
            fromState,
            // @ts-expect-error - Testing invalid parameters
            nullError,
          );
        }).toThrowError(TypeError);

        expect(listener1).not.toHaveBeenCalled();
        expect(listener2).not.toHaveBeenCalled();
      });

      it("should terminate execution at validation stage with null argument", () => {
        const toState = { name: "orders", params: {}, path: "/orders" };
        const fromState = { name: "cart", params: {}, path: "/cart" };
        const nullError = null;
        const consoleErrorSpy = vi
          .spyOn(logger, "error")
          .mockImplementation(() => {});
        const listener = vi.fn();

        router.addEventListener(events.TRANSITION_ERROR, listener);

        expect(() => {
          router.invokeEventListeners(
            events.TRANSITION_ERROR,
            toState,
            fromState,
            // @ts-expect-error - Testing invalid parameters
            nullError,
          );
        }).toThrowError(TypeError);

        // No console errors should be logged since listeners are never called
        expect(consoleErrorSpy).not.toHaveBeenCalled();
        expect(listener).not.toHaveBeenCalled();

        consoleErrorSpy.mockRestore();
      });

      it("should fail validation even with valid toState and fromState when error is null", () => {
        const validToState = { name: "help", params: {}, path: "/help" };
        const validFromState = {
          name: "support",
          params: {},
          path: "/support",
        };
        const nullError = null;

        expect(() => {
          router.invokeEventListeners(
            events.TRANSITION_ERROR,
            validToState,
            validFromState,
            // @ts-expect-error - Testing invalid parameters
            nullError,
          );
        }).toThrowError(TypeError);
      });

      it("should handle null differently from undefined in validation", () => {
        const toState = { name: "contact", params: {}, path: "/contact" };
        const fromState = { name: "about", params: {}, path: "/about" };
        const nullError = null;
        const undefinedError = undefined;

        // Both null and undefined should fail validation
        expect(() => {
          router.invokeEventListeners(
            events.TRANSITION_ERROR,
            toState,
            fromState,
            // @ts-expect-error - Testing invalid parameters
            nullError,
          );
        }).toThrowError();

        expect(() => {
          router.invokeEventListeners(
            events.TRANSITION_ERROR,
            toState,
            fromState,
            undefinedError,
          );
        }).toThrowError();
      });

      it("should prevent any side effects when null validation fails", () => {
        const toState = {
          name: "search",
          params: { query: "test" },
          path: "/search?query=test",
        };
        const fromState = { name: "results", params: {}, path: "/results" };
        const nullError = null;
        const initialState = router.getState();

        expect(() => {
          router.invokeEventListeners(
            events.TRANSITION_ERROR,
            toState,
            fromState,
            // @ts-expect-error - Testing invalid parameters
            nullError,
          );
        }).toThrowError(TypeError);

        const stateAfterError = router.getState();

        expect(stateAfterError).toStrictEqual(initialState);
      });
    });
  });
});
