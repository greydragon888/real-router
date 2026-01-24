import { logger } from "@real-router/logger";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { events, RouterError } from "@real-router/core";

import { createTestRouter } from "../../../helpers";

import type { Router } from "@real-router/core";

let router: Router;
const noop = () => undefined;

describe("invokeEventListeners - Multiple errors", () => {
  beforeEach(() => {
    router = createTestRouter();

    router.start();
  });

  afterEach(() => {
    router.stop();
  });

  describe("multiple errors in different listeners", () => {
    it("should handle each error separately", () => {
      const consoleErrorCalls: any[][] = [];

      vi.spyOn(logger, "error").mockImplementation((...args) => {
        consoleErrorCalls.push(args);
      });

      const toState = {
        name: "dashboard",
        params: {},
        path: "/dashboard",
      };
      const fromState = { name: "login", params: {}, path: "/login" };

      const error1 = new Error("First listener error");
      const error2 = new Error("Second listener error");

      const throwingListener1 = vi.fn(() => {
        throw error1;
      });
      const throwingListener2 = vi.fn(() => {
        throw error2;
      });
      const workingListener = vi.fn();

      router.addEventListener(events.TRANSITION_START, throwingListener1);
      router.addEventListener(events.TRANSITION_START, throwingListener2);
      router.addEventListener(events.TRANSITION_START, workingListener);

      router.invokeEventListeners(events.TRANSITION_START, toState, fromState);

      expect(consoleErrorCalls).toHaveLength(2);
      expect(consoleErrorCalls[0][0]).toBe("Router");
      expect(consoleErrorCalls[0][1]).toBe("Error in listener for $$start:");
      expect(consoleErrorCalls[0][2]).toBe(error1);
      expect(consoleErrorCalls[1][0]).toBe("Router");
      expect(consoleErrorCalls[1][1]).toBe("Error in listener for $$start:");
      expect(consoleErrorCalls[1][2]).toBe(error2);
    });

    it("should log all errors to console", () => {
      vi.spyOn(logger, "error").mockImplementation(noop);

      const toState = {
        name: "profile",
        params: { id: "123" },
        path: "/profile/123",
      };
      const fromState = { name: "home", params: {}, path: "/home" };

      const throwingListener1 = vi.fn(() => {
        throw new TypeError("Type error in listener 1");
      });
      const throwingListener2 = vi.fn(() => {
        throw new RangeError("Range error in listener 2");
      });
      const workingListener = vi.fn();

      router.addEventListener(events.TRANSITION_START, throwingListener1);
      router.addEventListener(events.TRANSITION_START, throwingListener2);
      router.addEventListener(events.TRANSITION_START, workingListener);

      router.invokeEventListeners(events.TRANSITION_START, toState, fromState);

      expect(logger.error).toHaveBeenCalledTimes(2);
      expect(logger.error).toHaveBeenNthCalledWith(
        1,
        "Router",
        "Error in listener for $$start:",
        expect.any(TypeError),
      );
      expect(logger.error).toHaveBeenNthCalledWith(
        2,
        "Router",
        "Error in listener for $$start:",
        expect.any(RangeError),
      );
    });

    it("should execute correct listener successfully despite multiple errors", () => {
      vi.spyOn(logger, "error").mockImplementation(noop);

      const toState = { name: "settings", params: {}, path: "/settings" };
      const fromState = { name: "account", params: {}, path: "/account" };

      const throwingListener1 = vi.fn(() => {
        throw new Error("Error 1");
      });
      const throwingListener2 = vi.fn(() => {
        throw new Error("Error 2");
      });
      const workingListener = vi.fn();

      router.addEventListener(events.TRANSITION_START, throwingListener1);
      router.addEventListener(events.TRANSITION_START, workingListener);
      router.addEventListener(events.TRANSITION_START, throwingListener2);

      router.invokeEventListeners(events.TRANSITION_START, toState, fromState);

      expect(throwingListener1).toHaveBeenCalledWith(toState, fromState);
      expect(workingListener).toHaveBeenCalledWith(toState, fromState);
      expect(throwingListener2).toHaveBeenCalledWith(toState, fromState);
      expect(workingListener).toHaveBeenCalledTimes(1);
    });

    it("should continue processing despite multiple errors", () => {
      vi.spyOn(logger, "error").mockImplementation(noop);

      const toState = { name: "orders", params: {}, path: "/orders" };
      const fromState = { name: "cart", params: {}, path: "/cart" };
      const executionOrder: string[] = [];

      const throwingListener1 = vi.fn(() => {
        executionOrder.push("error1");

        throw new Error("Multiple error test 1");
      });
      const throwingListener2 = vi.fn(() => {
        executionOrder.push("error2");

        throw new Error("Multiple error test 2");
      });
      const workingListener = vi.fn(() => {
        executionOrder.push("working");
      });

      router.addEventListener(events.TRANSITION_START, throwingListener1);
      router.addEventListener(events.TRANSITION_START, workingListener);
      router.addEventListener(events.TRANSITION_START, throwingListener2);

      expect(() => {
        router.invokeEventListeners(
          events.TRANSITION_START,
          toState,
          fromState,
        );
      }).not.toThrowError();

      expect(executionOrder).toStrictEqual(["error1", "working", "error2"]);
      expect(logger.error).toHaveBeenCalledTimes(2);
    });

    it("should handle mixed error types in multiple listeners", () => {
      vi.spyOn(logger, "error").mockImplementation(noop);

      const toState = { name: "help", params: {}, path: "/help" };
      const fromState = { name: "support", params: {}, path: "/support" };

      const routerError = new RouterError("LISTENER_ROUTER_ERROR", {
        message: "Router error from listener",
      });

      const throwingListener1 = vi.fn(() => {
        throw new Error("Standard error");
      });
      const throwingListener2 = vi.fn(() => {
        throw routerError;
      });
      const workingListener = vi.fn();

      router.addEventListener(events.TRANSITION_START, throwingListener1);
      router.addEventListener(events.TRANSITION_START, throwingListener2);
      router.addEventListener(events.TRANSITION_START, workingListener);

      router.invokeEventListeners(events.TRANSITION_START, toState, fromState);

      expect(logger.error).toHaveBeenCalledTimes(2);
      expect(logger.error).toHaveBeenNthCalledWith(
        1,
        "Router",
        "Error in listener for $$start:",
        expect.any(Error),
      );
      expect(logger.error).toHaveBeenNthCalledWith(
        2,
        "Router",
        "Error in listener for $$start:",
        routerError,
      );
      expect(workingListener).toHaveBeenCalledWith(toState, fromState);
    });

    it("should handle alternating error and success pattern", () => {
      vi.spyOn(logger, "error").mockImplementation(noop);

      const toState = { name: "contact", params: {}, path: "/contact" };
      const fromState = { name: "about", params: {}, path: "/about" };
      const results: string[] = [];

      const throwingListener1 = vi.fn(() => {
        results.push("throw1");

        throw new Error("First error");
      });
      const workingListener1 = vi.fn(() => {
        results.push("work1");
      });
      const throwingListener2 = vi.fn(() => {
        results.push("throw2");

        throw new Error("Second error");
      });
      const workingListener2 = vi.fn(() => {
        results.push("work2");
      });
      const throwingListener3 = vi.fn(() => {
        results.push("throw3");

        throw new Error("Third error");
      });

      router.addEventListener(events.TRANSITION_START, throwingListener1);
      router.addEventListener(events.TRANSITION_START, workingListener1);
      router.addEventListener(events.TRANSITION_START, throwingListener2);
      router.addEventListener(events.TRANSITION_START, workingListener2);
      router.addEventListener(events.TRANSITION_START, throwingListener3);

      router.invokeEventListeners(events.TRANSITION_START, toState, fromState);

      expect(results).toStrictEqual([
        "throw1",
        "work1",
        "throw2",
        "work2",
        "throw3",
      ]);
      expect(logger.error).toHaveBeenCalledTimes(3);
      expect(workingListener1).toHaveBeenCalledWith(toState, fromState);
      expect(workingListener2).toHaveBeenCalledWith(toState, fromState);
    });

    it("should handle errors with different message patterns", () => {
      const consoleErrorCalls: any[][] = [];

      vi.spyOn(logger, "error").mockImplementation((...args) => {
        consoleErrorCalls.push(args);
      });

      const toState = {
        name: "search",
        params: { query: "test" },
        path: "/search?query=test",
      };
      const fromState = { name: "results", params: {}, path: "/results" };

      const throwingListener1 = vi.fn(() => {
        throw new Error("Detailed error message with context");
      });
      const throwingListener2 = vi.fn(() => {
        // eslint-disable-next-line unicorn/error-message
        throw new Error("");
      });
      const throwingListener3 = vi.fn(() => {
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw "String error message";
      });
      const workingListener = vi.fn();

      router.addEventListener(events.TRANSITION_START, throwingListener1);
      router.addEventListener(events.TRANSITION_START, throwingListener2);
      router.addEventListener(events.TRANSITION_START, throwingListener3);
      router.addEventListener(events.TRANSITION_START, workingListener);

      router.invokeEventListeners(events.TRANSITION_START, toState, fromState);

      expect(consoleErrorCalls).toHaveLength(3);
      expect(consoleErrorCalls[0][2].message).toBe(
        "Detailed error message with context",
      );
      expect(consoleErrorCalls[1][2].message).toBe("");
      expect(consoleErrorCalls[2][2]).toBe("String error message");
      expect(workingListener).toHaveBeenCalledWith(toState, fromState);
    });

    it("should maintain listener execution order despite multiple errors", () => {
      vi.spyOn(logger, "error").mockImplementation(noop);

      const toState = { name: "admin", params: {}, path: "/admin" };
      const fromState = {
        name: "dashboard",
        params: {},
        path: "/dashboard",
      };
      const callOrder: number[] = [];

      const listener1 = vi.fn(() => {
        callOrder.push(1);

        throw new Error("Error 1");
      });
      const listener2 = vi.fn(() => {
        callOrder.push(2);
      });
      const listener3 = vi.fn(() => {
        callOrder.push(3);

        throw new Error("Error 3");
      });
      const listener4 = vi.fn(() => {
        callOrder.push(4);
      });
      const listener5 = vi.fn(() => {
        callOrder.push(5);

        throw new Error("Error 5");
      });

      router.addEventListener(events.TRANSITION_START, listener1);
      router.addEventListener(events.TRANSITION_START, listener2);
      router.addEventListener(events.TRANSITION_START, listener3);
      router.addEventListener(events.TRANSITION_START, listener4);
      router.addEventListener(events.TRANSITION_START, listener5);

      router.invokeEventListeners(events.TRANSITION_START, toState, fromState);

      expect(callOrder).toStrictEqual([1, 2, 3, 4, 5]);
      expect(logger.error).toHaveBeenCalledTimes(3);
    });

    it("should not affect router state with multiple listener errors", () => {
      vi.spyOn(logger, "error").mockImplementation(noop);

      const toState = { name: "reports", params: {}, path: "/reports" };
      const fromState = {
        name: "analytics",
        params: {},
        path: "/analytics",
      };
      const initialState = router.getState();

      const throwingListener1 = vi.fn(() => {
        throw new Error("State corruption attempt 1");
      });
      const throwingListener2 = vi.fn(() => {
        throw new Error("State corruption attempt 2");
      });
      const workingListener = vi.fn();

      router.addEventListener(events.TRANSITION_START, throwingListener1);
      router.addEventListener(events.TRANSITION_START, throwingListener2);
      router.addEventListener(events.TRANSITION_START, workingListener);

      router.invokeEventListeners(events.TRANSITION_START, toState, fromState);

      const stateAfterErrors = router.getState();

      expect(stateAfterErrors).toStrictEqual(initialState);
      expect(logger.error).toHaveBeenCalledTimes(2);
    });
  });
});
