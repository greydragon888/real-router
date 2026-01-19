import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { events } from "router6";

import { createTestRouter } from "../../../helpers";

import type { Router, Unsubscribe } from "router6";

let router: Router;
const noop = () => undefined;

describe("invokeEventListeners - Clear all listeners", () => {
  beforeEach(() => {
    router = createTestRouter();

    router.start();
  });

  afterEach(() => {
    router.stop();
  });

  describe("clear all listeners during processing", () => {
    it("should execute all listeners in cloned array despite clearing", () => {
      const executionOrder: string[] = [];
      const unsubscribers: Unsubscribe[] = [];

      const clearingListener = vi.fn(() => {
        executionOrder.push("clearing");
        // Remove all listeners during execution
        unsubscribers.forEach((unsub) => {
          unsub();
        });
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

      unsubscribers.push(
        router.addEventListener(events.ROUTER_START, clearingListener),
        router.addEventListener(events.ROUTER_START, listener2),
        router.addEventListener(events.ROUTER_START, listener3),
        router.addEventListener(events.ROUTER_START, listener4),
      );

      router.invokeEventListeners(events.ROUTER_START);

      // All listeners should execute despite clearing
      expect(executionOrder).toStrictEqual([
        "clearing",
        "listener2",
        "listener3",
        "listener4",
      ]);
      expect(clearingListener).toHaveBeenCalledWith();
      expect(listener2).toHaveBeenCalledWith();
      expect(listener3).toHaveBeenCalledWith();
      expect(listener4).toHaveBeenCalledWith();
    });

    it("should not affect current processing when original array is cleared", () => {
      const executionResults: string[] = [];
      const allUnsubscribers: Unsubscribe[] = [];

      const listener1 = vi.fn(() => {
        executionResults.push("L1");
      });

      const massRemovalListener = vi.fn(() => {
        executionResults.push("massRemoval-start");
        // Clear all listeners from original array
        allUnsubscribers.forEach((unsubscribe) => {
          unsubscribe();
        });
        executionResults.push("massRemoval-end");
      });

      const listener3 = vi.fn(() => {
        executionResults.push("L3");
      });

      const listener4 = vi.fn(() => {
        executionResults.push("L4");
      });

      allUnsubscribers.push(
        router.addEventListener(events.ROUTER_START, listener1),
        router.addEventListener(events.ROUTER_START, massRemovalListener),
        router.addEventListener(events.ROUTER_START, listener3),
        router.addEventListener(events.ROUTER_START, listener4),
      );

      router.invokeEventListeners(events.ROUTER_START);

      expect(executionResults).toStrictEqual([
        "L1",
        "massRemoval-start",
        "massRemoval-end",
        "L3",
        "L4",
      ]);
    });

    it("should find no listeners in subsequent event invocation", () => {
      const firstInvocationResults: string[] = [];
      const secondInvocationResults: string[] = [];
      const unsubscribers: Unsubscribe[] = [];

      const clearingListener = vi.fn(() => {
        firstInvocationResults.push("clearing");
        unsubscribers.forEach((unsub) => {
          unsub();
        });
      });

      const listener2 = vi.fn(() => {
        firstInvocationResults.push("listener2");
      });

      const listener3 = vi.fn(() => {
        firstInvocationResults.push("listener3");
      });

      unsubscribers.push(
        router.addEventListener(events.ROUTER_START, clearingListener),
        router.addEventListener(events.ROUTER_START, listener2),
        router.addEventListener(events.ROUTER_START, listener3),
      );

      // First invocation - all should execute
      router.invokeEventListeners(events.ROUTER_START);

      expect(firstInvocationResults).toStrictEqual([
        "clearing",
        "listener2",
        "listener3",
      ]);

      // Add a new listener to track second invocation
      const trackingListener = vi.fn(() => {
        secondInvocationResults.push("tracking");
      });

      router.addEventListener(events.ROUTER_START, trackingListener);

      // Second invocation - only new listener should execute
      router.invokeEventListeners(events.ROUTER_START);

      expect(secondInvocationResults).toStrictEqual(["tracking"]);
      expect(clearingListener).toHaveBeenCalledTimes(1); // Not called again
      expect(listener2).toHaveBeenCalledTimes(1); // Not called again
      expect(listener3).toHaveBeenCalledTimes(1); // Not called again
    });

    it("should ensure cloning provides stability for current iteration", () => {
      const iterationStability: string[] = [];
      const allListeners: Unsubscribe[] = [];

      const stabilityTestListener1 = vi.fn(() => {
        iterationStability.push("stable1");
      });

      const clearAllListener = vi.fn(() => {
        iterationStability.push("clearAll-start");
        // Nuclear option - remove everything
        allListeners.forEach((unsubscribe) => {
          try {
            unsubscribe();
          } catch {
            // Ignore errors if already removed
          }
        });
        iterationStability.push("clearAll-end");
      });

      const stabilityTestListener2 = vi.fn(() => {
        iterationStability.push("stable2");
      });

      const stabilityTestListener3 = vi.fn(() => {
        iterationStability.push("stable3");
      });

      allListeners.push(
        router.addEventListener(events.ROUTER_START, stabilityTestListener1),
        router.addEventListener(events.ROUTER_START, clearAllListener),
        router.addEventListener(events.ROUTER_START, stabilityTestListener2),
        router.addEventListener(events.ROUTER_START, stabilityTestListener3),
      );

      router.invokeEventListeners(events.ROUTER_START);

      expect(iterationStability).toStrictEqual([
        "stable1",
        "clearAll-start",
        "clearAll-end",
        "stable2",
        "stable3",
      ]);
    });

    it("should handle partial clearing during iteration", () => {
      const executionLog: string[] = [];
      const firstHalfUnsubscribers: Unsubscribe[] = [];
      const secondHalfUnsubscribers: Unsubscribe[] = [];

      const listener1 = vi.fn(() => {
        executionLog.push("L1");
      });

      const partialClearListener = vi.fn(() => {
        executionLog.push("partialClear-start");
        // Clear only first half of listeners
        firstHalfUnsubscribers.forEach((unsub) => {
          unsub();
        });
        executionLog.push("partialClear-end");
      });

      const listener3 = vi.fn(() => {
        executionLog.push("L3");
      });

      const listener4 = vi.fn(() => {
        executionLog.push("L4");
      });

      const listener5 = vi.fn(() => {
        executionLog.push("L5");
      });

      firstHalfUnsubscribers.push(
        router.addEventListener(events.ROUTER_START, listener1),
        router.addEventListener(events.ROUTER_START, partialClearListener),
      );
      secondHalfUnsubscribers.push(
        router.addEventListener(events.ROUTER_START, listener3),
        router.addEventListener(events.ROUTER_START, listener4),
        router.addEventListener(events.ROUTER_START, listener5),
      );

      router.invokeEventListeners(events.ROUTER_START);

      // All listeners should execute in current iteration
      expect(executionLog).toStrictEqual([
        "L1",
        "partialClear-start",
        "partialClear-end",
        "L3",
        "L4",
        "L5",
      ]);
    });

    it("should handle clearing with transition events", () => {
      const toState = {
        name: "dashboard",
        params: {},
        path: "/dashboard",
      };
      const fromState = { name: "login", params: {}, path: "/login" };
      const transitionLog: string[] = [];
      const transitionUnsubscribers: Unsubscribe[] = [];

      const transitionListener1 = vi.fn(() => {
        transitionLog.push("transition1");
      });

      const transitionClearingListener = vi.fn(() => {
        transitionLog.push("transitionClearing");
        transitionUnsubscribers.forEach((unsub) => {
          unsub();
        });
      });

      const transitionListener2 = vi.fn(() => {
        transitionLog.push("transition2");
      });

      transitionUnsubscribers.push(
        router.addEventListener(events.TRANSITION_START, transitionListener1),
        router.addEventListener(
          events.TRANSITION_START,
          transitionClearingListener,
        ),
        router.addEventListener(events.TRANSITION_START, transitionListener2),
      );

      router.invokeEventListeners(events.TRANSITION_START, toState, fromState);

      expect(transitionLog).toStrictEqual([
        "transition1",
        "transitionClearing",
        "transition2",
      ]);
      expect(transitionListener1).toHaveBeenCalledWith(toState, fromState);
      expect(transitionClearingListener).toHaveBeenCalledWith(
        toState,
        fromState,
      );
      expect(transitionListener2).toHaveBeenCalledWith(toState, fromState);
    });

    it("should handle errors in clearing listener without affecting others", () => {
      vi.spyOn(console, "error").mockImplementation(noop);

      const executionTracker: string[] = [];
      const unsubscribeTargets: Unsubscribe[] = [];

      const erroringClearListener = vi.fn(() => {
        executionTracker.push("erroringClear-start");
        // Clear listeners
        unsubscribeTargets.forEach((unsub) => {
          unsub();
        });
        executionTracker.push("erroringClear-beforeError");

        throw new Error("Error during clearing");
      });

      const survivingListener1 = vi.fn(() => {
        executionTracker.push("surviving1");
      });

      const survivingListener2 = vi.fn(() => {
        executionTracker.push("surviving2");
      });

      unsubscribeTargets.push(
        router.addEventListener(events.ROUTER_START, erroringClearListener),
        router.addEventListener(events.ROUTER_START, survivingListener1),
        router.addEventListener(events.ROUTER_START, survivingListener2),
      );

      router.invokeEventListeners(events.ROUTER_START);

      expect(executionTracker).toStrictEqual([
        "erroringClear-start",
        "erroringClear-beforeError",
        "surviving1",
        "surviving2",
      ]);
      expect(console.error).toHaveBeenCalledWith(
        "[Router] Error in listener for $start:",
        expect.any(Error),
      );
    });

    it("should verify complete isolation through cloning", () => {
      const isolationTest: string[] = [];
      const isolationUnsubscribers: Unsubscribe[] = [];

      const isolationListener1 = vi.fn(() => {
        isolationTest.push("isolation1");
      });

      const aggressiveClearListener = vi.fn(() => {
        isolationTest.push("aggressiveClear-start");
        // Try to clear multiple times
        isolationUnsubscribers.forEach((unsub) => {
          unsub();
        });
        isolationUnsubscribers.forEach((unsub) => {
          try {
            unsub();
          } catch {
            /* ignore */
          }
        });
        isolationTest.push("aggressiveClear-end");
      });

      const isolationListener2 = vi.fn(() => {
        isolationTest.push("isolation2");
      });

      const isolationListener3 = vi.fn(() => {
        isolationTest.push("isolation3");
      });

      isolationUnsubscribers.push(
        router.addEventListener(events.ROUTER_START, isolationListener1),
        router.addEventListener(events.ROUTER_START, aggressiveClearListener),
        router.addEventListener(events.ROUTER_START, isolationListener2),
        router.addEventListener(events.ROUTER_START, isolationListener3),
      );

      router.invokeEventListeners(events.ROUTER_START);

      expect(isolationTest).toStrictEqual([
        "isolation1",
        "aggressiveClear-start",
        "aggressiveClear-end",
        "isolation2",
        "isolation3",
      ]);
    });

    it("should demonstrate complete listener array cleanup for next invocation", () => {
      const firstRun: string[] = [];
      const secondRun: string[] = [];
      const cleanupTargets: Unsubscribe[] = [];

      const cleanupListener = vi.fn(() => {
        firstRun.push("cleanup");
        cleanupTargets.forEach((unsub) => {
          unsub();
        });
      });

      const tempListener1 = vi.fn(() => {
        firstRun.push("temp1");
      });

      const tempListener2 = vi.fn(() => {
        firstRun.push("temp2");
      });

      cleanupTargets.push(
        router.addEventListener(events.ROUTER_START, cleanupListener),
        router.addEventListener(events.ROUTER_START, tempListener1),
        router.addEventListener(events.ROUTER_START, tempListener2),
      );

      // First run - all execute, then all are removed
      router.invokeEventListeners(events.ROUTER_START);

      expect(firstRun).toStrictEqual(["cleanup", "temp1", "temp2"]);

      // Add new listener to verify array is empty
      const verificationListener = vi.fn(() => {
        secondRun.push("verification");
      });

      router.addEventListener(events.ROUTER_START, verificationListener);

      // Second run - only new listener should execute
      router.invokeEventListeners(events.ROUTER_START);

      expect(secondRun).toStrictEqual(["verification"]);
      expect(cleanupListener).toHaveBeenCalledTimes(1);
      expect(tempListener1).toHaveBeenCalledTimes(1);
      expect(tempListener2).toHaveBeenCalledTimes(1);
    });
  });
});
