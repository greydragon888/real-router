import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { events, RouterError } from "router6";

import { createTestRouter } from "../../../helpers";

import type { Router, NavigationOptions, Unsubscribe } from "router6";

let router: Router;
const noop = () => undefined;

describe("invokeEventListeners - Empty listeners handling", () => {
  beforeEach(() => {
    router = createTestRouter();

    router.start();
  });

  afterEach(() => {
    router.stop();
  });

  describe("event call without registered listeners after removal", () => {
    it("should execute without errors when no listeners remain", () => {
      // Register some listeners
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      const listener3 = vi.fn();

      const unsub1 = router.addEventListener(events.ROUTER_START, listener1);
      const unsub2 = router.addEventListener(events.ROUTER_START, listener2);
      const unsub3 = router.addEventListener(events.ROUTER_START, listener3);

      // Verify listeners work initially
      router.invokeEventListeners(events.ROUTER_START);

      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);
      expect(listener3).toHaveBeenCalledTimes(1);

      // Remove all listeners
      unsub1();
      unsub2();
      unsub3();

      // Call event with no listeners - should not throw
      expect(() => {
        router.invokeEventListeners(events.ROUTER_START);
      }).not.toThrowError();
    });

    it("should handle empty listeners array correctly", () => {
      // Register and immediately remove listeners
      const tempListener1 = vi.fn();
      const tempListener2 = vi.fn();

      const unsub1 = router.addEventListener(events.ROUTER_STOP, tempListener1);
      const unsub2 = router.addEventListener(events.ROUTER_STOP, tempListener2);

      unsub1();
      unsub2();

      // Multiple calls with empty array should work
      expect(() => {
        router.invokeEventListeners(events.ROUTER_STOP);
        router.invokeEventListeners(events.ROUTER_STOP);
        router.invokeEventListeners(events.ROUTER_STOP);
      }).not.toThrowError();

      expect(tempListener1).toHaveBeenCalledTimes(0);
      expect(tempListener2).toHaveBeenCalledTimes(0);
    });

    it("should pass parameter validation normally with no listeners", () => {
      const toState = {
        name: "dashboard",
        params: {},
        path: "/dashboard",
      };
      const fromState = { name: "login", params: {}, path: "/login" };
      const navigationOptions: NavigationOptions = { replace: true };

      // Register and remove transition listeners
      const transitionListener = vi.fn();
      const unsub = router.addEventListener(
        events.TRANSITION_SUCCESS,
        transitionListener,
      );

      unsub();

      // Valid parameters should not throw even with no listeners
      expect(() => {
        router.invokeEventListeners(
          events.TRANSITION_SUCCESS,
          toState,
          fromState,
          navigationOptions,
        );
      }).not.toThrowError();

      // Invalid parameters should still throw even with no listeners
      expect(() => {
        router.invokeEventListeners(
          events.TRANSITION_SUCCESS,
          undefined,
          fromState,
          navigationOptions,
        );
      }).toThrowError(TypeError);

      expect(() => {
        router.invokeEventListeners(
          events.TRANSITION_SUCCESS,
          toState,
          fromState,
          // @ts-expect-error - Testing invalid parameters
          "invalid options",
        );
      }).toThrowError(TypeError);
    });

    it("should not cause any side effects when no listeners exist", () => {
      vi.spyOn(console, "error").mockImplementation(noop);
      vi.spyOn(console, "log").mockImplementation(noop);
      vi.spyOn(console, "warn").mockImplementation(noop);

      // Register and remove listeners
      const sideEffectListener = vi.fn();
      const unsub = router.addEventListener(
        events.ROUTER_STOP,
        sideEffectListener,
      );

      unsub();

      const initialState = router.getState();

      // Call event with no listeners
      router.invokeEventListeners(events.ROUTER_STOP);

      const finalState = router.getState();

      // No console output should occur
      expect(console.error).not.toHaveBeenCalled();
      expect(console.log).not.toHaveBeenCalled();
      expect(console.warn).not.toHaveBeenCalled();

      // Router state should remain unchanged
      expect(finalState).toStrictEqual(initialState);

      // Listener should not have been called
      expect(sideEffectListener).not.toHaveBeenCalled();
    });

    it("should handle multiple event types with empty listener arrays", () => {
      const toState = {
        name: "profile",
        params: { id: "123" },
        path: "/profile/123",
      };
      const fromState = { name: "home", params: {}, path: "/home" };
      const routerError = new RouterError("TEST_ERROR", {
        message: "Test error",
      });
      const navigationOptions: NavigationOptions = { reload: true };

      // Register listeners for all event types
      const listeners = [
        router.addEventListener(events.ROUTER_START, vi.fn()),
        router.addEventListener(events.TRANSITION_START, vi.fn()),
        router.addEventListener(events.TRANSITION_ERROR, vi.fn()),
        router.addEventListener(events.TRANSITION_SUCCESS, vi.fn()),
        router.addEventListener(events.TRANSITION_CANCEL, vi.fn()),
        router.addEventListener(events.ROUTER_STOP, vi.fn()),
      ];

      // Remove all listeners
      listeners.forEach((unsub) => {
        unsub();
      });

      // Call all event types - none should throw
      expect(() => {
        router.invokeEventListeners(events.ROUTER_START);
        router.invokeEventListeners(
          events.TRANSITION_START,
          toState,
          fromState,
        );
        router.invokeEventListeners(
          events.TRANSITION_ERROR,
          toState,
          fromState,
          routerError,
        );
        router.invokeEventListeners(
          events.TRANSITION_SUCCESS,
          toState,
          fromState,
          navigationOptions,
        );
        router.invokeEventListeners(
          events.TRANSITION_CANCEL,
          toState,
          fromState,
        );
        router.invokeEventListeners(events.ROUTER_STOP);
      }).not.toThrowError();
    });

    it("should handle progressive listener removal", () => {
      const executionLog: string[] = [];

      // Register 4 listeners
      const listener1 = vi.fn(() => executionLog.push("L1"));
      const listener2 = vi.fn(() => executionLog.push("L2"));
      const listener3 = vi.fn(() => executionLog.push("L3"));
      const listener4 = vi.fn(() => executionLog.push("L4"));

      const unsub1 = router.addEventListener(events.ROUTER_START, listener1);
      const unsub2 = router.addEventListener(events.ROUTER_START, listener2);
      const unsub3 = router.addEventListener(events.ROUTER_START, listener3);
      const unsub4 = router.addEventListener(events.ROUTER_START, listener4);

      // Progressive removal and testing
      router.invokeEventListeners(events.ROUTER_START); // All 4

      unsub1();
      router.invokeEventListeners(events.ROUTER_START); // 3 remaining

      unsub2();
      unsub3();
      router.invokeEventListeners(events.ROUTER_START); // 1 remaining

      unsub4();
      router.invokeEventListeners(events.ROUTER_START); // 0 remaining - should not throw

      expect(executionLog).toStrictEqual([
        "L1",
        "L2",
        "L3",
        "L4", // First call: all listeners
        "L2",
        "L3",
        "L4", // Second call: L1 removed
        "L4", // Third call: L2, L3 removed
        // Fourth call: no listeners, no additions to log
      ]);

      expect(() => {
        router.invokeEventListeners(events.ROUTER_START);
      }).not.toThrowError();
    });

    it("should handle removal of all listeners during event processing", () => {
      const processLog: string[] = [];
      const allUnsubscribers: Unsubscribe[] = [];

      const listener1 = vi.fn(() => {
        processLog.push("L1-start");
        // Remove all listeners during processing
        allUnsubscribers.forEach((unsub) => {
          unsub();
        });
        processLog.push("L1-end");
      });

      const listener2 = vi.fn(() => {
        processLog.push("L2");
      });

      const listener3 = vi.fn(() => {
        processLog.push("L3");
      });

      allUnsubscribers.push(
        router.addEventListener(events.ROUTER_START, listener1),
        router.addEventListener(events.ROUTER_START, listener2),
        router.addEventListener(events.ROUTER_START, listener3),
      );

      // First call - listeners remove themselves during execution
      router.invokeEventListeners(events.ROUTER_START);

      // Second call - should work with empty array
      expect(() => {
        router.invokeEventListeners(events.ROUTER_START);
      }).not.toThrowError();

      // Due to array cloning, all listeners should execute in first call
      expect(processLog).toStrictEqual(["L1-start", "L1-end", "L2", "L3"]);
    });

    it("should maintain performance with repeated empty array processing", () => {
      // Register and remove a listener to ensure array exists but is empty
      const tempListener = vi.fn();
      const unsub = router.addEventListener(events.ROUTER_START, tempListener);

      unsub();

      // Multiple rapid calls should be efficient and not throw
      const startTime = Date.now();

      for (let i = 0; i < 100; i++) {
        expect(() => {
          router.invokeEventListeners(events.ROUTER_START);
        }).not.toThrowError();
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete quickly (less than 100ms for 100 calls)
      expect(duration).toBeLessThan(100);
      expect(tempListener).not.toHaveBeenCalled();
    });

    it("should handle complex scenarios with mixed empty and non-empty arrays", () => {
      const scenarioLog: string[] = [];

      // Event type 1: has listeners
      const activeListener = vi.fn(() => scenarioLog.push("active"));

      router.addEventListener(events.ROUTER_START, activeListener);

      // Event type 2: had listeners, now empty
      const removedListener = vi.fn(() => scenarioLog.push("removed"));
      const unsub = router.addEventListener(
        events.ROUTER_STOP,
        removedListener,
      );

      unsub();

      // Event type 3: never had listeners

      // Mixed calls
      router.invokeEventListeners(events.ROUTER_START); // Should call activeListener
      router.invokeEventListeners(events.ROUTER_STOP); // Should not call removedListener

      expect(scenarioLog).toStrictEqual(["active"]);
      expect(activeListener).toHaveBeenCalledTimes(1);
      expect(removedListener).not.toHaveBeenCalled();
    });

    it("should preserve event parameter validation even with no listeners", () => {
      // Remove any existing listeners for transition events
      const tempListener = vi.fn();
      const unsub = router.addEventListener(
        events.TRANSITION_ERROR,
        tempListener,
      );

      unsub();

      const toState = { name: "test", params: {}, path: "/test" };
      const fromState = { name: "prev", params: {}, path: "/prev" };
      const validError = new RouterError("VALID_ERROR", {
        message: "Valid",
      });

      // Valid call should not throw
      expect(() => {
        router.invokeEventListeners(
          events.TRANSITION_ERROR,
          toState,
          fromState,
          validError,
        );
      }).not.toThrowError();

      expect(() => {
        router.invokeEventListeners(
          events.TRANSITION_ERROR,
          toState,
          fromState,
          // @ts-expect-error - Testing invalid parameters
          "not an error",
        );
      }).toThrowError(TypeError); // ✅ This will work

      expect(() => {
        router.invokeEventListeners(
          events.TRANSITION_ERROR,
          toState,
          fromState,
          // @ts-expect-error - Testing invalid parameters
          null,
        );
      }).toThrowError(TypeError);

      expect(tempListener).not.toHaveBeenCalled();
    });
  });
});
