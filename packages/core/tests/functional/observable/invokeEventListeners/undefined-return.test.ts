import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { events } from "@real-router/core";

import { createTestRouter } from "../../../helpers";

import type { Router } from "@real-router/core";

let router: Router;
const noop = () => undefined;

describe("invokeEventListeners - Undefined return", () => {
  beforeEach(() => {
    router = createTestRouter();

    router.start();
  });

  afterEach(() => {
    router.stop();
  });

  describe("listener returns undefined", () => {
    it("should execute listener that explicitly returns undefined without errors", () => {
      const undefinedReturningListener = vi.fn(() => {
        return;
      });

      router.addEventListener(events.ROUTER_STOP, undefinedReturningListener);

      expect(() => {
        router.invokeEventListeners(events.ROUTER_STOP);
      }).not.toThrowError();

      expect(undefinedReturningListener).toHaveBeenCalledWith();
      expect(undefinedReturningListener).toHaveBeenCalledTimes(1);
    });

    it("should ignore returned undefined value", () => {
      vi.spyOn(console, "error").mockImplementation(noop);

      const undefinedReturningListener = vi.fn(() => {
        return;
      });
      const subsequentListener = vi.fn();

      router.addEventListener(events.ROUTER_STOP, undefinedReturningListener);
      router.addEventListener(events.ROUTER_STOP, subsequentListener);

      router.invokeEventListeners(events.ROUTER_STOP);

      expect(undefinedReturningListener).toHaveBeenCalledWith();
      expect(subsequentListener).toHaveBeenCalledWith();
      expect(console.error).not.toHaveBeenCalled();
    });

    it("should continue processing normally after undefined return", () => {
      const executionOrder: string[] = [];

      const listener1 = vi.fn(() => {
        executionOrder.push("listener1");
      });
      const listener2 = vi.fn(() => {
        executionOrder.push("listener2");
      });
      const listener3 = vi.fn(() => {
        executionOrder.push("listener3");
      });

      router.addEventListener(events.ROUTER_STOP, listener1);
      router.addEventListener(events.ROUTER_STOP, listener2);
      router.addEventListener(events.ROUTER_STOP, listener3);

      router.invokeEventListeners(events.ROUTER_STOP);

      expect(executionOrder).toStrictEqual([
        "listener1",
        "listener2",
        "listener3",
      ]);
      expect(listener1).toHaveBeenCalledWith();
      expect(listener2).toHaveBeenCalledWith();
      expect(listener3).toHaveBeenCalledWith();
    });

    it("should not perform any additional actions for undefined return", () => {
      vi.spyOn(console, "error").mockImplementation(noop);
      vi.spyOn(console, "log").mockImplementation(noop);
      vi.spyOn(console, "warn").mockImplementation(noop);

      const undefinedReturningListener = vi.fn(() => {
        return;
      });

      router.addEventListener(events.ROUTER_STOP, undefinedReturningListener);

      router.invokeEventListeners(events.ROUTER_STOP);

      // Using console spies since we're checking if any logging occurred
      expect(console.error).not.toHaveBeenCalled();
      expect(console.log).not.toHaveBeenCalled();
      expect(console.warn).not.toHaveBeenCalled();
      expect(undefinedReturningListener).toHaveBeenCalledWith();
    });

    it("should handle listeners that implicitly return undefined", () => {
      const implicitUndefinedListener = vi.fn(noop);
      const explicitUndefinedListener = vi.fn(() => {
        return;
      });

      router.addEventListener(events.ROUTER_STOP, implicitUndefinedListener);
      router.addEventListener(events.ROUTER_STOP, explicitUndefinedListener);

      expect(() => {
        router.invokeEventListeners(events.ROUTER_STOP);
      }).not.toThrowError();

      expect(implicitUndefinedListener).toHaveBeenCalledWith();
      expect(explicitUndefinedListener).toHaveBeenCalledWith();
    });

    it("should handle undefined return in transition event listeners", () => {
      const toState = {
        name: "dashboard",
        params: {},
        path: "/dashboard",
      };
      const fromState = { name: "login", params: {}, path: "/login" };

      const undefinedReturningListener = vi.fn(() => {
        return;
      });
      const normalListener = vi.fn();

      router.addEventListener(
        events.TRANSITION_START,
        undefinedReturningListener,
      );
      router.addEventListener(events.TRANSITION_START, normalListener);

      expect(() => {
        router.invokeEventListeners(
          events.TRANSITION_START,
          toState,
          fromState,
        );
      }).not.toThrowError();

      expect(undefinedReturningListener).toHaveBeenCalledWith(
        toState,
        fromState,
      );
      expect(normalListener).toHaveBeenCalledWith(toState, fromState);
    });

    it("should handle mixed return values including undefined", () => {
      const executionResults: any[] = [];

      const undefinedListener = vi.fn(() => {
        executionResults.push("undefined");
      });
      const stringListener = vi.fn(() => {
        executionResults.push("string");

        return "some string";
      });
      const numberListener = vi.fn(() => {
        executionResults.push("number");

        return 42;
      });
      const voidListener = vi.fn(() => {
        executionResults.push("void");
        // Implicit undefined return
      });

      router.addEventListener(events.ROUTER_STOP, undefinedListener);
      router.addEventListener(events.ROUTER_STOP, stringListener);
      router.addEventListener(events.ROUTER_STOP, numberListener);
      router.addEventListener(events.ROUTER_STOP, voidListener);

      router.invokeEventListeners(events.ROUTER_STOP);

      expect(executionResults).toStrictEqual([
        "undefined",
        "string",
        "number",
        "void",
      ]);
      expect(undefinedListener).toHaveBeenCalledWith();
      expect(stringListener).toHaveBeenCalledWith();
      expect(numberListener).toHaveBeenCalledWith();
      expect(voidListener).toHaveBeenCalledWith();
    });

    it("should not affect router state when listener returns undefined", () => {
      const initialState = router.getState();

      const undefinedReturningListener = vi.fn(() => {
        return;
      });

      router.addEventListener(events.ROUTER_STOP, undefinedReturningListener);

      router.invokeEventListeners(events.ROUTER_STOP);

      const stateAfterExecution = router.getState();

      expect(stateAfterExecution).toStrictEqual(initialState);
    });

    it("should handle async listeners that return undefined", () => {
      const asyncUndefinedListener = vi.fn(async () => {
        await Promise.resolve();
      });
      const syncListener = vi.fn();

      // eslint-disable-next-line @typescript-eslint/no-misused-promises -- intentionally testing async listener with undefined return
      router.addEventListener(events.ROUTER_STOP, asyncUndefinedListener);
      router.addEventListener(events.ROUTER_STOP, syncListener);

      expect(() => {
        router.invokeEventListeners(events.ROUTER_STOP);
      }).not.toThrowError();

      expect(asyncUndefinedListener).toHaveBeenCalledWith();
      expect(syncListener).toHaveBeenCalledWith();
    });

    it("should handle listeners with conditional undefined returns", () => {
      const conditionalListener = vi.fn((param1, param2) => {
        if (!param1 && !param2) {
          return;
        }

        return "processed";
      });

      router.addEventListener(events.ROUTER_STOP, conditionalListener);

      // ROUTER_STOP events don't pass parameters, so condition should be true
      expect(() => {
        router.invokeEventListeners(events.ROUTER_STOP);
      }).not.toThrowError();

      expect(conditionalListener).toHaveBeenCalledWith();
    });

    it("should handle multiple consecutive undefined-returning listeners", () => {
      const listener1 = vi.fn(() => undefined);
      const listener2 = vi.fn(() => undefined);
      const listener3 = vi.fn(() => undefined);
      const listener4 = vi.fn(() => undefined);

      router.addEventListener(events.ROUTER_STOP, listener1);
      router.addEventListener(events.ROUTER_STOP, listener2);
      router.addEventListener(events.ROUTER_STOP, listener3);
      router.addEventListener(events.ROUTER_STOP, listener4);

      expect(() => {
        router.invokeEventListeners(events.ROUTER_STOP);
      }).not.toThrowError();

      expect(listener1).toHaveBeenCalledWith();
      expect(listener2).toHaveBeenCalledWith();
      expect(listener3).toHaveBeenCalledWith();
      expect(listener4).toHaveBeenCalledWith();
    });
  });
});
