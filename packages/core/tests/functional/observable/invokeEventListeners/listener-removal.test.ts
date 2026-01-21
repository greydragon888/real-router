import { logger } from "logger";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { events } from "@real-router/core";

import { createTestRouter } from "../../../helpers";

import type { Router, Unsubscribe } from "@real-router/core";

let router: Router;
const noop = () => undefined;

describe("invokeEventListeners - Listener removal", () => {
  beforeEach(() => {
    router = createTestRouter();

    router.start();
  });

  afterEach(() => {
    router.stop();
  });

  describe("listener removal during event processing", () => {
    it("should complete current listener execution despite self-removal", () => {
      const executionOrder: string[] = [];
      let unsubscribe: Unsubscribe;

      const selfRemovingListener = vi.fn(() => {
        executionOrder.push("selfRemoving-start");
        unsubscribe(); // Remove itself during execution
        executionOrder.push("selfRemoving-end");
      });

      const secondListener = vi.fn(() => {
        executionOrder.push("secondListener");
      });

      unsubscribe = router.addEventListener(
        events.ROUTER_START,
        selfRemovingListener,
      );
      router.addEventListener(events.ROUTER_START, secondListener);

      router.invokeEventListeners(events.ROUTER_START);

      expect(executionOrder).toStrictEqual([
        "selfRemoving-start",
        "selfRemoving-end",
        "secondListener",
      ]);
      expect(selfRemovingListener).toHaveBeenCalledWith();
      expect(secondListener).toHaveBeenCalledWith();
    });

    it("should execute second listener normally after first removes itself", () => {
      let unsubscribe: Unsubscribe;

      const selfRemovingListener = vi.fn(() => {
        unsubscribe();
      });

      const secondListener = vi.fn();

      unsubscribe = router.addEventListener(
        events.ROUTER_START,
        selfRemovingListener,
      );
      router.addEventListener(events.ROUTER_START, secondListener);

      router.invokeEventListeners(events.ROUTER_START);

      expect(selfRemovingListener).toHaveBeenCalledWith();
      expect(secondListener).toHaveBeenCalledWith();
      expect(selfRemovingListener).toHaveBeenCalledTimes(1);
      expect(secondListener).toHaveBeenCalledTimes(1);
    });

    it("should not affect current iteration due to array cloning", () => {
      const executionResults: string[] = [];
      let unsubscribe1: Unsubscribe;
      let unsubscribe2: Unsubscribe;

      const listener1 = vi.fn(() => {
        executionResults.push("listener1");
        unsubscribe2(); // Remove listener2 during execution
      });

      const listener2 = vi.fn(() => {
        executionResults.push("listener2");
      });

      const listener3 = vi.fn(() => {
        executionResults.push("listener3");
        unsubscribe1(); // Remove listener1 during execution
      });

      unsubscribe1 = router.addEventListener(events.ROUTER_START, listener1);
      unsubscribe2 = router.addEventListener(events.ROUTER_START, listener2);
      router.addEventListener(events.ROUTER_START, listener3);

      router.invokeEventListeners(events.ROUTER_START);

      // All listeners should execute despite removal attempts
      expect(executionResults).toStrictEqual([
        "listener1",
        "listener2",
        "listener3",
      ]);
      expect(listener1).toHaveBeenCalledWith();
      expect(listener2).toHaveBeenCalledWith();
      expect(listener3).toHaveBeenCalledWith();
    });

    it("should remove listener from original array for future invocations", () => {
      let unsubscribe: Unsubscribe;
      let selfRemovalCount = 0;

      const selfRemovingListener = vi.fn(() => {
        selfRemovalCount++;
        if (selfRemovalCount === 1) {
          unsubscribe(); // Remove itself only on first call
        }
      });

      const persistentListener = vi.fn();

      unsubscribe = router.addEventListener(
        events.ROUTER_START,
        selfRemovingListener,
      );
      router.addEventListener(events.ROUTER_START, persistentListener);

      // First invocation - both listeners should execute
      router.invokeEventListeners(events.ROUTER_START);

      expect(selfRemovingListener).toHaveBeenCalledTimes(1);
      expect(persistentListener).toHaveBeenCalledTimes(1);

      // Second invocation - only persistent listener should execute
      router.invokeEventListeners(events.ROUTER_START);

      expect(selfRemovingListener).toHaveBeenCalledTimes(1); // Still 1, not called again
      expect(persistentListener).toHaveBeenCalledTimes(2); // Called again
    });

    it("should handle multiple listeners removing themselves simultaneously", () => {
      const executionOrder: string[] = [];
      let unsubscribe1: Unsubscribe;
      let unsubscribe2: Unsubscribe;
      let unsubscribe3: Unsubscribe;

      const listener1 = vi.fn(() => {
        executionOrder.push("listener1");
        unsubscribe1(); // Remove itself
      });

      const listener2 = vi.fn(() => {
        executionOrder.push("listener2");
        unsubscribe2(); // Remove itself
      });

      const listener3 = vi.fn(() => {
        executionOrder.push("listener3");
        unsubscribe3(); // Remove itself
      });

      const persistentListener = vi.fn(() => {
        executionOrder.push("persistent");
      });

      unsubscribe1 = router.addEventListener(events.ROUTER_START, listener1);
      unsubscribe2 = router.addEventListener(events.ROUTER_START, listener2);
      unsubscribe3 = router.addEventListener(events.ROUTER_START, listener3);
      router.addEventListener(events.ROUTER_START, persistentListener);

      // First invocation - all listeners should execute
      router.invokeEventListeners(events.ROUTER_START);

      expect(executionOrder).toStrictEqual([
        "listener1",
        "listener2",
        "listener3",
        "persistent",
      ]);

      // Second invocation - only persistent listener should execute
      executionOrder.length = 0;
      router.invokeEventListeners(events.ROUTER_START);

      expect(executionOrder).toStrictEqual(["persistent"]);
    });

    it("should handle removal of other listeners during execution", () => {
      const executionOrder: string[] = [];
      let unsubscribe2: Unsubscribe;
      let unsubscribe3: Unsubscribe;

      const listener1 = vi.fn(() => {
        executionOrder.push("listener1");
        unsubscribe2(); // Remove listener2
        unsubscribe3(); // Remove listener3
      });

      const listener2 = vi.fn(() => {
        executionOrder.push("listener2");
      });

      const listener3 = vi.fn(() => {
        executionOrder.push("listener3");
      });

      const listener4 = vi.fn(() => {
        executionOrder.push("listener4");
      });

      router.addEventListener(events.ROUTER_START, listener1);
      unsubscribe2 = router.addEventListener(events.ROUTER_START, listener2);
      unsubscribe3 = router.addEventListener(events.ROUTER_START, listener3);
      router.addEventListener(events.ROUTER_START, listener4);

      router.invokeEventListeners(events.ROUTER_START);

      // All listeners should execute in current iteration due to cloning
      expect(executionOrder).toStrictEqual([
        "listener1",
        "listener2",
        "listener3",
        "listener4",
      ]);
    });

    it("should handle transition event listener removal during processing", () => {
      const toState = {
        name: "dashboard",
        params: {},
        path: "/dashboard",
      };
      const fromState = { name: "login", params: {}, path: "/login" };
      const executionOrder: string[] = [];
      let unsubscribe: Unsubscribe;

      const selfRemovingListener = vi.fn(() => {
        executionOrder.push("transition-selfRemoving");
        unsubscribe();
      });

      const normalListener = vi.fn(() => {
        executionOrder.push("transition-normal");
      });

      unsubscribe = router.addEventListener(
        events.TRANSITION_START,
        selfRemovingListener,
      );
      router.addEventListener(events.TRANSITION_START, normalListener);

      router.invokeEventListeners(events.TRANSITION_START, toState, fromState);

      expect(executionOrder).toStrictEqual([
        "transition-selfRemoving",
        "transition-normal",
      ]);
      expect(selfRemovingListener).toHaveBeenCalledWith(toState, fromState);
      expect(normalListener).toHaveBeenCalledWith(toState, fromState);
    });

    it("should handle error in listener that removes itself", () => {
      vi.spyOn(logger, "error").mockImplementation(noop);

      const executionOrder: string[] = [];
      let unsubscribe: Unsubscribe;

      const errorAndRemoveListener = vi.fn(() => {
        executionOrder.push("errorAndRemove-start");
        unsubscribe(); // Remove itself
        executionOrder.push("errorAndRemove-beforeError");

        throw new Error("Error after self-removal");
      });

      const normalListener = vi.fn(() => {
        executionOrder.push("normal");
      });

      unsubscribe = router.addEventListener(
        events.ROUTER_START,
        errorAndRemoveListener,
      );
      router.addEventListener(events.ROUTER_START, normalListener);

      router.invokeEventListeners(events.ROUTER_START);

      expect(executionOrder).toStrictEqual([
        "errorAndRemove-start",
        "errorAndRemove-beforeError",
        "normal",
      ]);
      expect(logger.error).toHaveBeenCalledWith(
        "Router",
        "Error in listener for $start:",
        expect.any(Error),
      );
      expect(normalListener).toHaveBeenCalledWith();
    });

    it("should verify listener is removed from future invocations", () => {
      let unsubscribe: Unsubscribe;
      let removalExecutionCount = 0;

      const conditionalRemovalListener = vi.fn(() => {
        removalExecutionCount++;
        if (removalExecutionCount === 2) {
          unsubscribe(); // Remove itself on second execution
        }
      });

      const counterListener = vi.fn();

      unsubscribe = router.addEventListener(
        events.ROUTER_START,
        conditionalRemovalListener,
      );
      router.addEventListener(events.ROUTER_START, counterListener);

      // First invocation
      router.invokeEventListeners(events.ROUTER_START);

      expect(conditionalRemovalListener).toHaveBeenCalledTimes(1);
      expect(counterListener).toHaveBeenCalledTimes(1);

      // Second invocation - removal happens
      router.invokeEventListeners(events.ROUTER_START);

      expect(conditionalRemovalListener).toHaveBeenCalledTimes(2);
      expect(counterListener).toHaveBeenCalledTimes(2);

      // Third invocation - removed listener should not execute
      router.invokeEventListeners(events.ROUTER_START);

      expect(conditionalRemovalListener).toHaveBeenCalledTimes(2); // Still 2
      expect(counterListener).toHaveBeenCalledTimes(3); // Increased to 3
    });

    it("should handle complex removal patterns during iteration", () => {
      const executionLog: string[] = [];
      let unsubscribe1: Unsubscribe;
      let unsubscribe2: Unsubscribe;
      let unsubscribe4: Unsubscribe;

      const listener1 = vi.fn(() => {
        executionLog.push("L1-start");
        unsubscribe2(); // Remove L2
        executionLog.push("L1-end");
      });

      const listener2 = vi.fn(() => {
        executionLog.push("L2-start");
        unsubscribe1(); // Remove L1 (already executed)
        executionLog.push("L2-end");
      });

      const listener3 = vi.fn(() => {
        executionLog.push("L3-start");
        unsubscribe4(); // Remove L4 (not yet executed)
        executionLog.push("L3-end");
      });

      const listener4 = vi.fn(() => {
        executionLog.push("L4");
      });

      unsubscribe1 = router.addEventListener(events.ROUTER_START, listener1);
      unsubscribe2 = router.addEventListener(events.ROUTER_START, listener2);
      router.addEventListener(events.ROUTER_START, listener3);
      unsubscribe4 = router.addEventListener(events.ROUTER_START, listener4);

      router.invokeEventListeners(events.ROUTER_START);

      // All should execute due to array cloning protection
      expect(executionLog).toStrictEqual([
        "L1-start",
        "L1-end",
        "L2-start",
        "L2-end",
        "L3-start",
        "L3-end",
        "L4",
      ]);
    });
  });
});
