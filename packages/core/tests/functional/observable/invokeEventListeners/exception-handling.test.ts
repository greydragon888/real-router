import { logger } from "@real-router/logger";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { events, RouterError } from "@real-router/core";

import { createTestRouter } from "../../../helpers";

import type { Router } from "@real-router/core";

let router: Router;
const noop = () => undefined;

describe("invokeEventListeners - Exception handling", () => {
  beforeEach(() => {
    router = createTestRouter();

    router.start();
  });

  afterEach(() => {
    router.stop();
  });

  describe("exception handling in one of the listeners", () => {
    it("should catch and log exception from first listener", () => {
      vi.spyOn(logger, "error").mockImplementation(noop);

      const errorMessage = "First listener exception";
      const throwingListener = vi.fn(() => {
        throw new Error(errorMessage);
      });
      const workingListener = vi.fn();

      router.addEventListener(events.ROUTER_START, throwingListener);
      router.addEventListener(events.ROUTER_START, workingListener);

      router.invokeEventListeners(events.ROUTER_START);

      // Logger format: logger.error(context, message, error)
      expect(logger.error).toHaveBeenCalledWith(
        "Router",
        "Error in listener for $start:",
        expect.any(Error),
      );
      expect(throwingListener).toHaveBeenCalledWith();
    });

    it("should execute second listener normally after first listener throws", () => {
      vi.spyOn(logger, "error").mockImplementation(noop);

      const throwingListener = vi.fn(() => {
        throw new Error("First listener error");
      });
      const workingListener = vi.fn();

      router.addEventListener(events.ROUTER_START, throwingListener);
      router.addEventListener(events.ROUTER_START, workingListener);

      router.invokeEventListeners(events.ROUTER_START);

      expect(throwingListener).toHaveBeenCalledWith();
      expect(workingListener).toHaveBeenCalledWith();
      expect(workingListener).toHaveBeenCalledTimes(1);
    });

    it("should not interrupt method execution due to listener error", () => {
      vi.spyOn(logger, "error").mockImplementation(noop);

      const throwingListener = vi.fn(() => {
        throw new Error("Listener error");
      });
      const workingListener = vi.fn();

      router.addEventListener(events.ROUTER_START, throwingListener);
      router.addEventListener(events.ROUTER_START, workingListener);

      expect(() => {
        router.invokeEventListeners(events.ROUTER_START);
      }).not.toThrowError();

      expect(throwingListener).toHaveBeenCalledWith();
      expect(workingListener).toHaveBeenCalledWith();
    });

    it("should output error message to console with event name", () => {
      const loggerErrorCalls: any[][] = [];

      vi.spyOn(logger, "error").mockImplementation((...args) => {
        loggerErrorCalls.push(args);
      });

      const specificError = new Error("Specific listener error");
      const throwingListener = vi.fn(() => {
        throw specificError;
      });

      router.addEventListener(events.ROUTER_START, throwingListener);

      router.invokeEventListeners(events.ROUTER_START);

      // Logger format: logger.error(context, message, error)
      expect(loggerErrorCalls).toHaveLength(1);
      expect(loggerErrorCalls[0][0]).toBe("Router");
      expect(loggerErrorCalls[0][1]).toBe("Error in listener for $start:");
      expect(loggerErrorCalls[0][2]).toBe(specificError);
    });

    it("should handle multiple failing listeners in sequence", () => {
      vi.spyOn(logger, "error").mockImplementation(noop);

      const error1 = new Error("First error");
      const error2 = new Error("Second error");

      const throwingListener1 = vi.fn(() => {
        throw error1;
      });
      const throwingListener2 = vi.fn(() => {
        throw error2;
      });
      const workingListener = vi.fn();

      router.addEventListener(events.ROUTER_START, throwingListener1);
      router.addEventListener(events.ROUTER_START, throwingListener2);
      router.addEventListener(events.ROUTER_START, workingListener);

      router.invokeEventListeners(events.ROUTER_START);

      expect(logger.error).toHaveBeenCalledTimes(2);
      expect(throwingListener1).toHaveBeenCalledWith();
      expect(throwingListener2).toHaveBeenCalledWith();
      expect(workingListener).toHaveBeenCalledWith();
    });

    it("should handle different types of errors in listeners", () => {
      vi.spyOn(logger, "error").mockImplementation(noop);

      const typeErrorListener = vi.fn(() => {
        throw new TypeError("Type error in listener");
      });
      const rangeErrorListener = vi.fn(() => {
        throw new RangeError("Range error in listener");
      });
      const stringErrorListener = vi.fn(() => {
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw "String error";
      });
      const workingListener = vi.fn();

      router.addEventListener(events.ROUTER_START, typeErrorListener);
      router.addEventListener(events.ROUTER_START, rangeErrorListener);
      router.addEventListener(events.ROUTER_START, stringErrorListener);
      router.addEventListener(events.ROUTER_START, workingListener);

      router.invokeEventListeners(events.ROUTER_START);

      expect(logger.error).toHaveBeenCalledTimes(3);
      expect(typeErrorListener).toHaveBeenCalledWith();
      expect(rangeErrorListener).toHaveBeenCalledWith();
      expect(stringErrorListener).toHaveBeenCalledWith();
      expect(workingListener).toHaveBeenCalledWith();
    });

    it("should preserve execution order despite errors", () => {
      vi.spyOn(logger, "error").mockImplementation(noop);

      const executionOrder: string[] = [];

      const listener1 = vi.fn(() => {
        executionOrder.push("listener1");

        throw new Error("Error in listener1");
      });
      const listener2 = vi.fn(() => {
        executionOrder.push("listener2");
      });
      const listener3 = vi.fn(() => {
        executionOrder.push("listener3");

        throw new Error("Error in listener3");
      });
      const listener4 = vi.fn(() => {
        executionOrder.push("listener4");
      });

      router.addEventListener(events.ROUTER_START, listener1);
      router.addEventListener(events.ROUTER_START, listener2);
      router.addEventListener(events.ROUTER_START, listener3);
      router.addEventListener(events.ROUTER_START, listener4);

      router.invokeEventListeners(events.ROUTER_START);

      expect(executionOrder).toStrictEqual([
        "listener1",
        "listener2",
        "listener3",
        "listener4",
      ]);
      expect(logger.error).toHaveBeenCalledTimes(2);
    });

    it("should handle errors in listeners for transition events", () => {
      vi.spyOn(logger, "error").mockImplementation(noop);

      const toState = {
        name: "dashboard",
        params: {},
        path: "/dashboard",
      };
      const fromState = { name: "login", params: {}, path: "/login" };

      const throwingListener = vi.fn(() => {
        throw new Error("Transition listener error");
      });
      const workingListener = vi.fn();

      router.addEventListener(events.TRANSITION_START, throwingListener);
      router.addEventListener(events.TRANSITION_START, workingListener);

      router.invokeEventListeners(events.TRANSITION_START, toState, fromState);

      // Logger format: logger.error(context, message, error)
      expect(logger.error).toHaveBeenCalledWith(
        "Router",
        "Error in listener for $$start:",
        expect.any(Error),
      );
      expect(throwingListener).toHaveBeenCalledWith(toState, fromState);
      expect(workingListener).toHaveBeenCalledWith(toState, fromState);
    });

    it("should handle async listener errors properly", () => {
      vi.spyOn(logger, "error").mockImplementation(noop);

      const asyncThrowingListener = vi.fn(async () => {
        await Promise.resolve();

        throw new Error("Async listener error");
      });
      const syncWorkingListener = vi.fn();

      // eslint-disable-next-line @typescript-eslint/no-misused-promises -- intentionally testing async listener error handling
      router.addEventListener(events.ROUTER_START, asyncThrowingListener);
      router.addEventListener(events.ROUTER_START, syncWorkingListener);

      router.invokeEventListeners(events.ROUTER_START);

      // Sync listener should execute immediately
      expect(syncWorkingListener).toHaveBeenCalledWith();
      expect(asyncThrowingListener).toHaveBeenCalledWith();
    });

    it("should handle RouterError thrown from listener", () => {
      vi.spyOn(logger, "error").mockImplementation(noop);

      const routerError = new RouterError("LISTENER_ERROR", {
        message: "Router error from listener",
      });

      const throwingListener = vi.fn(() => {
        throw routerError;
      });
      const workingListener = vi.fn();

      router.addEventListener(events.ROUTER_START, throwingListener);
      router.addEventListener(events.ROUTER_START, workingListener);

      router.invokeEventListeners(events.ROUTER_START);

      // Logger format: logger.error(context, message, error)
      expect(logger.error).toHaveBeenCalledWith(
        "Router",
        "Error in listener for $start:",
        routerError,
      );
      expect(throwingListener).toHaveBeenCalledWith();
      expect(workingListener).toHaveBeenCalledWith();
    });

    it("should not affect router state when listener throws error", () => {
      vi.spyOn(logger, "error").mockImplementation(noop);

      const initialState = router.getState();

      const throwingListener = vi.fn(() => {
        throw new Error("State modification attempt");
      });

      router.addEventListener(events.ROUTER_START, throwingListener);

      router.invokeEventListeners(events.ROUTER_START);

      const stateAfterError = router.getState();

      expect(stateAfterError).toStrictEqual(initialState);
    });
  });
});
