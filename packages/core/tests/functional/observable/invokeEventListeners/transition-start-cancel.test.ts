import { logger } from "@real-router/logger";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { events } from "@real-router/core";

import { createTestRouter } from "../../../helpers";

import type { Unsubscribe, Router } from "@real-router/core";

let router: Router;
const noop = () => undefined;

describe("invokeEventListeners - TRANSITION_START and TRANSITION_CANCEL", () => {
  beforeEach(() => {
    router = createTestRouter();

    router.start();
  });

  afterEach(() => {
    router.stop();
  });

  describe("validation of TRANSITION_START and TRANSITION_CANCEL events", () => {
    describe("successful TRANSITION_START event call with correct parameters", () => {
      const toState = { name: "home", params: {}, path: "/home" };
      const fromState = { name: "about", params: {}, path: "/about" };

      it("should execute without errors when called with valid toState and fromState", () => {
        expect(() => {
          router.invokeEventListeners(
            events.TRANSITION_START,
            toState,
            fromState,
          );
        }).not.toThrowError();
      });

      it("should call all registered TRANSITION_START listeners with toState and fromState parameters", () => {
        const listener1 = vi.fn();
        const listener2 = vi.fn();

        router.addEventListener(events.TRANSITION_START, listener1);
        router.addEventListener(events.TRANSITION_START, listener2);

        router.invokeEventListeners(
          events.TRANSITION_START,
          toState,
          fromState,
        );

        expect(listener1).toHaveBeenCalledWith(toState, fromState);
        expect(listener2).toHaveBeenCalledWith(toState, fromState);
      });

      it("should call listeners in the order they were registered", () => {
        const callOrder: number[] = [];

        const listener1 = vi.fn(() => callOrder.push(1));
        const listener2 = vi.fn(() => callOrder.push(2));
        const listener3 = vi.fn(() => callOrder.push(3));

        router.addEventListener(events.TRANSITION_START, listener1);
        router.addEventListener(events.TRANSITION_START, listener2);
        router.addEventListener(events.TRANSITION_START, listener3);

        router.invokeEventListeners(
          events.TRANSITION_START,
          toState,
          fromState,
        );

        expect(callOrder).toStrictEqual([1, 2, 3]);
      });

      it("should catch errors in listeners and log them to console", () => {
        const errorMessage = "Test listener error";
        const consoleErrorSpy = vi
          .spyOn(logger, "error")
          .mockImplementation(() => {});

        const failingListener = vi.fn(() => {
          throw new Error(errorMessage);
        });
        const workingListener = vi.fn();

        router.addEventListener(events.TRANSITION_START, failingListener);
        router.addEventListener(events.TRANSITION_START, workingListener);

        router.invokeEventListeners(
          events.TRANSITION_START,
          toState,
          fromState,
        );

        expect(consoleErrorSpy).toHaveBeenCalledWith(
          "Router",
          "Error in listener for $$start:",
          expect.any(Error),
        );
        expect(workingListener).toHaveBeenCalledWith(toState, fromState);

        consoleErrorSpy.mockRestore();
      });

      it("should continue executing remaining listeners when one listener throws an error", () => {
        const consoleErrorSpy = vi
          .spyOn(logger, "error")
          .mockImplementation(() => {});

        const listener1 = vi.fn();
        const failingListener = vi.fn(() => {
          throw new Error("Test error");
        });
        const listener3 = vi.fn();

        router.addEventListener(events.TRANSITION_START, listener1);
        router.addEventListener(events.TRANSITION_START, failingListener);
        router.addEventListener(events.TRANSITION_START, listener3);

        router.invokeEventListeners(
          events.TRANSITION_START,
          toState,
          fromState,
        );

        expect(listener1).toHaveBeenCalledWith(toState, fromState);
        expect(failingListener).toHaveBeenCalledWith(toState, fromState);
        expect(listener3).toHaveBeenCalledWith(toState, fromState);

        consoleErrorSpy.mockRestore();
      });
    });

    describe("successful TRANSITION_CANCEL event call with correct parameters", () => {
      it("should execute without errors when called with valid toState and undefined fromState", () => {
        const toState = {
          name: "profile",
          params: { id: "123" },
          path: "/profile/123",
        };

        expect(() => {
          router.invokeEventListeners(events.TRANSITION_CANCEL, toState);
        }).not.toThrowError();
      });

      it("should call all registered TRANSITION_CANCEL listeners with toState and undefined fromState", () => {
        const toState = {
          name: "profile",
          params: { id: "123" },
          path: "/profile/123",
        };
        const listener1 = vi.fn();
        const listener2 = vi.fn();
        const listener3 = vi.fn();

        router.addEventListener(events.TRANSITION_CANCEL, listener1);
        router.addEventListener(events.TRANSITION_CANCEL, listener2);
        router.addEventListener(events.TRANSITION_CANCEL, listener3);

        router.invokeEventListeners(events.TRANSITION_CANCEL, toState);

        expect(listener1).toHaveBeenCalledWith(toState, undefined);
        expect(listener2).toHaveBeenCalledWith(toState, undefined);
        expect(listener3).toHaveBeenCalledWith(toState, undefined);
      });

      it("should call each listener with correct arguments", () => {
        const toState = {
          name: "dashboard",
          params: { section: "analytics" },
          path: "/dashboard/analytics",
        };
        const listener = vi.fn();

        router.addEventListener(events.TRANSITION_CANCEL, listener);

        router.invokeEventListeners(events.TRANSITION_CANCEL, toState);

        expect(listener).toHaveBeenCalledTimes(1);
        expect(listener).toHaveBeenCalledWith(toState, undefined);
      });

      it("should ensure safe iteration through array cloning when listeners modify the array during execution", () => {
        const toState = { name: "settings", params: {}, path: "/settings" };
        const executionOrder: string[] = [];

        const listener1 = vi.fn(() => {
          executionOrder.push("listener1");
        });

        const listener2 = vi.fn(() => {
          executionOrder.push("listener2");
          // This listener adds another listener during execution
          router.addEventListener(events.TRANSITION_CANCEL, () => {
            executionOrder.push("dynamicallyAdded");
          });
        });

        const listener3 = vi.fn(() => {
          executionOrder.push("listener3");
        });

        router.addEventListener(events.TRANSITION_CANCEL, listener1);
        router.addEventListener(events.TRANSITION_CANCEL, listener2);
        router.addEventListener(events.TRANSITION_CANCEL, listener3);

        router.invokeEventListeners(events.TRANSITION_CANCEL, toState);

        // All originally registered listeners should execute
        expect(listener1).toHaveBeenCalledWith(toState, undefined);
        expect(listener2).toHaveBeenCalledWith(toState, undefined);
        expect(listener3).toHaveBeenCalledWith(toState, undefined);

        // Execution order should be preserved despite dynamic listener addition
        expect(executionOrder).toStrictEqual([
          "listener1",
          "listener2",
          "listener3",
        ]);
      });

      it("should handle array cloning safely when listeners remove themselves during execution", () => {
        const toState = { name: "help", params: {}, path: "/help" };
        const executionOrder: string[] = [];

        const listener1 = vi.fn(() => {
          executionOrder.push("listener1");
        });

        let listener2Unsubscribe: Unsubscribe;
        const listener2 = vi.fn(() => {
          executionOrder.push("listener2");
          // This listener removes itself during execution
          listener2Unsubscribe();
        });

        const listener3 = vi.fn(() => {
          executionOrder.push("listener3");
        });

        router.addEventListener(events.TRANSITION_CANCEL, listener1);
        listener2Unsubscribe = router.addEventListener(
          events.TRANSITION_CANCEL,
          listener2,
        );
        router.addEventListener(events.TRANSITION_CANCEL, listener3);

        router.invokeEventListeners(events.TRANSITION_CANCEL, toState);

        // All originally registered listeners should still execute
        expect(listener1).toHaveBeenCalledWith(toState, undefined);
        expect(listener2).toHaveBeenCalledWith(toState, undefined);
        expect(listener3).toHaveBeenCalledWith(toState, undefined);

        expect(executionOrder).toStrictEqual([
          "listener1",
          "listener2",
          "listener3",
        ]);
      });
    });

    describe("error when toState is missing for TRANSITION_START event", () => {
      it("should throw TypeError with correct message when toState is undefined", () => {
        const fromState = { name: "about", params: {}, path: "/about" };

        expect(() => {
          router.invokeEventListeners(
            events.TRANSITION_START,
            undefined,
            fromState,
          );
        }).toThrowError(TypeError);
      });

      it("should not call any listeners when toState validation fails", () => {
        const fromState = { name: "about", params: {}, path: "/about" };
        const listener1 = vi.fn();
        const listener2 = vi.fn();

        router.addEventListener(events.TRANSITION_START, listener1);
        router.addEventListener(events.TRANSITION_START, listener2);

        expect(() => {
          router.invokeEventListeners(
            events.TRANSITION_START,
            undefined,
            fromState,
          );
        }).toThrowError(TypeError);

        expect(listener1).not.toHaveBeenCalled();
        expect(listener2).not.toHaveBeenCalled();
      });

      it("should terminate execution at validation stage when toState is missing", () => {
        const fromState = { name: "contact", params: {}, path: "/contact" };
        const consoleErrorSpy = vi
          .spyOn(logger, "error")
          .mockImplementation(() => {});
        const listener = vi.fn();

        router.addEventListener(events.TRANSITION_START, listener);

        expect(() => {
          router.invokeEventListeners(
            events.TRANSITION_START,
            undefined,
            fromState,
          );
        }).toThrowError(TypeError);

        // No console errors should be logged since listeners are never called
        expect(consoleErrorSpy).not.toHaveBeenCalled();
        expect(listener).not.toHaveBeenCalled();

        consoleErrorSpy.mockRestore();
      });

      it("should throw TypeError when toState is null", () => {
        const fromState = { name: "home", params: {}, path: "/home" };

        expect(() => {
          router.invokeEventListeners(
            events.TRANSITION_START,
            // @ts-expect-error - Testing invalid parameters
            null,
            fromState,
          );
        }).toThrowError(TypeError);
      });

      it("should throw TypeError when toState is any other falsy value", () => {
        const fromState = {
          name: "services",
          params: {},
          path: "/services",
        };

        expect(() => {
          router.invokeEventListeners(
            events.TRANSITION_START,
            // @ts-expect-error - Testing invalid parameters
            "",
            fromState,
          );
        }).toThrowError(TypeError);

        expect(() => {
          router.invokeEventListeners(
            events.TRANSITION_START,
            // @ts-expect-error - Testing invalid parameters
            0,
            fromState,
          );
        }).toThrowError(TypeError);
      });
    });

    describe("error when toState is missing for TRANSITION_CANCEL event", () => {
      it("should throw TypeError with correct message when toState is null", () => {
        const fromState = {
          name: "products",
          params: {},
          path: "/products",
        };

        expect(() => {
          router.invokeEventListeners(
            events.TRANSITION_CANCEL,
            // @ts-expect-error - Testing invalid parameters
            null,
            fromState,
          );
        }).toThrowError(TypeError);
      });

      it("should not execute any event listeners when toState validation fails", () => {
        const fromState = { name: "cart", params: {}, path: "/cart" };
        const listener1 = vi.fn();
        const listener2 = vi.fn();
        const listener3 = vi.fn();

        router.addEventListener(events.TRANSITION_CANCEL, listener1);
        router.addEventListener(events.TRANSITION_CANCEL, listener2);
        router.addEventListener(events.TRANSITION_CANCEL, listener3);

        expect(() => {
          router.invokeEventListeners(
            events.TRANSITION_CANCEL,
            // @ts-expect-error - Testing invalid parameters
            null,
            fromState,
          );
        }).toThrowError(TypeError);

        expect(listener1).not.toHaveBeenCalled();
        expect(listener2).not.toHaveBeenCalled();
        expect(listener3).not.toHaveBeenCalled();
      });

      it("should keep router state unchanged when validation fails", () => {
        const fromState = {
          name: "checkout",
          params: {},
          path: "/checkout",
        };
        const initialState = router.getState();

        expect(() => {
          router.invokeEventListeners(
            events.TRANSITION_CANCEL,
            // @ts-expect-error - Testing invalid parameters
            null,
            fromState,
          );
        }).toThrowError(TypeError);

        const stateAfterError = router.getState();

        expect(stateAfterError).toStrictEqual(initialState);
      });

      it("should throw TypeError when toState is undefined", () => {
        const fromState = { name: "orders", params: {}, path: "/orders" };

        expect(() => {
          router.invokeEventListeners(
            events.TRANSITION_CANCEL,
            undefined,
            fromState,
          );
        }).toThrowError(TypeError);
      });

      it("should throw TypeError for any falsy toState value", () => {
        const fromState = { name: "account", params: {}, path: "/account" };

        expect(() => {
          router.invokeEventListeners(
            events.TRANSITION_CANCEL,
            // @ts-expect-error - Testing invalid parameters
            "",
            fromState,
          );
        }).toThrowError(TypeError);

        expect(() => {
          router.invokeEventListeners(
            events.TRANSITION_CANCEL,
            // @ts-expect-error - Testing invalid parameters
            0,
            fromState,
          );
        }).toThrowError(TypeError);
      });

      it("should not log any console errors when validation fails before listener execution", () => {
        const fromState = { name: "profile", params: {}, path: "/profile" };
        const consoleErrorSpy = vi
          .spyOn(logger, "error")
          .mockImplementation(() => {});
        const listener = vi.fn();

        router.addEventListener(events.TRANSITION_CANCEL, listener);

        expect(() => {
          router.invokeEventListeners(
            events.TRANSITION_CANCEL,
            // @ts-expect-error - Testing invalid parameters
            null,
            fromState,
          );
        }).toThrowError(TypeError);

        expect(consoleErrorSpy).not.toHaveBeenCalled();
        expect(listener).not.toHaveBeenCalled();

        consoleErrorSpy.mockRestore();
      });
    });

    describe("TRANSITION_START call with empty listeners array", () => {
      it("should execute without errors when no listeners are registered", () => {
        const toState = {
          name: "dashboard",
          params: {},
          path: "/dashboard",
        };
        const fromState = { name: "login", params: {}, path: "/login" };

        // Ensure no listeners are registered for TRANSITION_START
        // (fresh router instance should have empty listeners by default)

        expect(() => {
          router.invokeEventListeners(
            events.TRANSITION_START,
            toState,
            fromState,
          );
        }).not.toThrowError();
      });

      it("should call invokeFor with empty listeners array without side effects", () => {
        const toState = { name: "settings", params: {}, path: "/settings" };
        const fromState = { name: "home", params: {}, path: "/home" };
        const consoleErrorSpy = vi
          .spyOn(logger, "error")
          .mockImplementation(noop);

        // No listeners registered, so invokeFor should handle empty array
        router.invokeEventListeners(
          events.TRANSITION_START,
          toState,
          fromState,
        );

        // No console errors should be logged since no listeners exist to fail
        expect(consoleErrorSpy).not.toHaveBeenCalled();

        consoleErrorSpy.mockRestore();
      });

      it("should not produce any side effects when listeners array is empty", () => {
        const toState = {
          name: "profile",
          params: { userId: "123" },
          path: "/profile/123",
        };
        const fromState = { name: "users", params: {}, path: "/users" };
        const initialState = router.getState();

        router.invokeEventListeners(
          events.TRANSITION_START,
          toState,
          fromState,
        );

        const stateAfterInvocation = router.getState();

        expect(stateAfterInvocation).toStrictEqual(initialState);
      });

      it("should pass parameter validation successfully with empty listeners", () => {
        const toState = {
          name: "search",
          params: { query: "test" },
          path: "/search?query=test",
        };
        const fromState = { name: "results", params: {}, path: "/results" };

        // Should not throw any validation errors
        expect(() => {
          router.invokeEventListeners(
            events.TRANSITION_START,
            toState,
            fromState,
          );
        }).not.toThrowError();

        // Should specifically not throw TypeError for missing toState
        expect(() => {
          router.invokeEventListeners(
            events.TRANSITION_START,
            toState,
            fromState,
          );
        }).not.toThrowError(TypeError);
      });

      it("should handle fromState as undefined with empty listeners array", () => {
        const toState = { name: "help", params: {}, path: "/help" };

        expect(() => {
          router.invokeEventListeners(events.TRANSITION_START, toState);
        }).not.toThrowError();
      });

      it("should complete execution immediately when no listeners need to be called", () => {
        const toState = { name: "contact", params: {}, path: "/contact" };
        const fromState = { name: "about", params: {}, path: "/about" };
        const startTime = Date.now();

        router.invokeEventListeners(
          events.TRANSITION_START,
          toState,
          fromState,
        );

        const endTime = Date.now();
        const executionTime = endTime - startTime;

        // Execution should be very fast with no listeners
        expect(executionTime).toBeLessThan(10);
      });
    });
  });
});
