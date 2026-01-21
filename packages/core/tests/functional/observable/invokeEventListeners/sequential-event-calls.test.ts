import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { events, RouterError } from "@real-router/core";

import { createTestRouter } from "../../../helpers";

import type { Router, NavigationOptions } from "@real-router/core";

let router: Router;
const noop = () => undefined;

describe("invokeEventListeners - Sequential event calls", () => {
  beforeEach(() => {
    router = createTestRouter();

    router.start();
  });

  afterEach(() => {
    router.stop();
  });

  describe("sequential calls of different event types", () => {
    it("should process each event with correct parameters", () => {
      const toState = {
        name: "dashboard",
        params: { id: "123" },
        path: "/dashboard/123",
      };
      const fromState = { name: "login", params: {}, path: "/login" };
      const navigationOptions: NavigationOptions = {
        replace: true,
        reload: false,
      };
      const eventLog: string[] = [];

      // Register listeners for all event types
      const routerStartListener = vi.fn(() => {
        eventLog.push("ROUTER_START");
      });

      const transitionStartListener = vi.fn(
        (receivedToState, receivedFromState) => {
          eventLog.push("TRANSITION_START");

          expect(receivedToState).toStrictEqual(toState);
          expect(receivedFromState).toStrictEqual(fromState);
        },
      );

      const transitionSuccessListener = vi.fn(
        (receivedToState, receivedFromState, receivedOptions) => {
          eventLog.push("TRANSITION_SUCCESS");

          expect(receivedToState).toStrictEqual(toState);
          expect(receivedFromState).toStrictEqual(fromState);
          expect(receivedOptions).toStrictEqual(navigationOptions);
        },
      );

      const routerStopListener = vi.fn(() => {
        eventLog.push("ROUTER_STOP");
      });

      router.addEventListener(events.ROUTER_START, routerStartListener);
      router.addEventListener(events.TRANSITION_START, transitionStartListener);
      router.addEventListener(
        events.TRANSITION_SUCCESS,
        transitionSuccessListener,
      );
      router.addEventListener(events.ROUTER_STOP, routerStopListener);

      // Sequential calls
      router.invokeEventListeners(events.ROUTER_START);
      router.invokeEventListeners(events.TRANSITION_START, toState, fromState);
      router.invokeEventListeners(
        events.TRANSITION_SUCCESS,
        toState,
        fromState,
        navigationOptions,
      );
      router.invokeEventListeners(events.ROUTER_STOP);

      expect(eventLog).toStrictEqual([
        "ROUTER_START",
        "TRANSITION_START",
        "TRANSITION_SUCCESS",
        "ROUTER_STOP",
      ]);
    });

    it("should provide correct arguments based on event type", () => {
      const toState = {
        name: "profile",
        params: { userId: "456" },
        path: "/profile/456",
      };
      const fromState = { name: "home", params: {}, path: "/home" };
      const routerError = new RouterError("NAVIGATION_ERROR", {
        message: "Test error",
      });
      const navigationOptions: NavigationOptions = {
        force: true,
        skipTransition: false,
      };

      const argumentValidators = {
        routerStart: vi.fn((...args) => {
          expect(args).toHaveLength(0);
        }),

        transitionStart: vi.fn((...args) => {
          expect(args).toHaveLength(2);
          expect(args[0]).toStrictEqual(toState);
          expect(args[1]).toStrictEqual(fromState);
        }),

        transitionError: vi.fn((...args) => {
          expect(args).toHaveLength(3);
          expect(args[0]).toStrictEqual(toState);
          expect(args[1]).toStrictEqual(fromState);
          expect(args[2]).toBe(routerError);
        }),

        transitionSuccess: vi.fn((...args) => {
          expect(args).toHaveLength(3);
          expect(args[0]).toStrictEqual(toState);
          expect(args[1]).toStrictEqual(fromState);
          expect(args[2]).toStrictEqual(navigationOptions);
        }),
      };

      router.addEventListener(
        events.ROUTER_START,
        argumentValidators.routerStart,
      );
      router.addEventListener(
        events.TRANSITION_START,
        argumentValidators.transitionStart,
      );
      router.addEventListener(
        events.TRANSITION_ERROR,
        argumentValidators.transitionError,
      );
      router.addEventListener(
        events.TRANSITION_SUCCESS,
        argumentValidators.transitionSuccess,
      );

      router.invokeEventListeners(events.ROUTER_START);
      router.invokeEventListeners(events.TRANSITION_START, toState, fromState);
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

      Object.values(argumentValidators).forEach((validator) => {
        expect(validator).toHaveBeenCalledTimes(1);
      });
    });

    it("should not mix state between different event calls", () => {
      const firstToState = {
        name: "page1",
        params: { id: "1" },
        path: "/page1/1",
      };
      const firstFromState = { name: "home", params: {}, path: "/home" };
      const secondToState = {
        name: "page2",
        params: { id: "2" },
        path: "/page2/2",
      };
      const secondFromState = {
        name: "page1",
        params: { id: "1" },
        path: "/page1/1",
      };

      const stateTracker: {
        event: string;
        toState?: any;
        fromState?: any;
      }[] = [];

      const transitionStartListener = vi.fn((toState, fromState) => {
        stateTracker.push({
          event: "TRANSITION_START",
          toState,
          fromState,
        });
      });

      const transitionCancelListener = vi.fn((toState, fromState) => {
        stateTracker.push({
          event: "TRANSITION_CANCEL",
          toState,
          fromState,
        });
      });

      router.addEventListener(events.TRANSITION_START, transitionStartListener);
      router.addEventListener(
        events.TRANSITION_CANCEL,
        transitionCancelListener,
      );

      // First transition
      router.invokeEventListeners(
        events.TRANSITION_START,
        firstToState,
        firstFromState,
      );

      // Second transition with different states
      router.invokeEventListeners(
        events.TRANSITION_CANCEL,
        secondToState,
        secondFromState,
      );

      expect(stateTracker).toHaveLength(2);
      expect(stateTracker[0].toState).toStrictEqual(firstToState);
      expect(stateTracker[0].fromState).toStrictEqual(firstFromState);
      expect(stateTracker[1].toState).toStrictEqual(secondToState);
      expect(stateTracker[1].fromState).toStrictEqual(secondFromState);
    });

    it("should validate independently for each event call", () => {
      const toState = { name: "settings", params: {}, path: "/settings" };
      const fromState = { name: "account", params: {}, path: "/account" };
      const routerError = new RouterError("TEST_ERROR", {
        message: "Validation test",
      });
      const navigationOptions: NavigationOptions = { reload: true };

      // Valid calls should succeed
      expect(() => {
        router.invokeEventListeners(events.ROUTER_START);
      }).not.toThrowError();

      expect(() => {
        router.invokeEventListeners(
          events.TRANSITION_START,
          toState,
          fromState,
        );
      }).not.toThrowError();

      expect(() => {
        router.invokeEventListeners(
          events.TRANSITION_ERROR,
          toState,
          fromState,
          routerError,
        );
      }).not.toThrowError();

      expect(() => {
        router.invokeEventListeners(
          events.TRANSITION_SUCCESS,
          toState,
          fromState,
          navigationOptions,
        );
      }).not.toThrowError();

      // Invalid calls should fail independently
      expect(() => {
        router.invokeEventListeners(
          events.TRANSITION_START,
          undefined,
          fromState,
        );
      }).toThrowError(TypeError);

      expect(() => {
        router.invokeEventListeners(
          events.TRANSITION_ERROR,
          toState,
          fromState,
          // @ts-expect-error - Testing invalid parameters
          "not a RouterError",
        );
      }).toThrowError(TypeError);

      expect(() => {
        router.invokeEventListeners(
          events.TRANSITION_SUCCESS,
          toState,
          fromState,
          routerError,
        );
      }).toThrowError(TypeError);
    });

    it("should handle complex sequential scenario with all event types", () => {
      const executionFlow: string[] = [];
      const toState = {
        name: "complex",
        params: { step: "final" },
        path: "/complex/final",
      };
      const fromState = {
        name: "simple",
        params: { step: "initial" },
        path: "/simple/initial",
      };
      const routerError = new RouterError("COMPLEX_ERROR", {
        message: "Complex scenario error",
      });
      const navigationOptions: NavigationOptions = {
        replace: false,
        reload: true,
        metadata: { flow: "sequential" },
      };

      // Comprehensive listeners with correct event mapping
      const listeners = {
        routerStart: vi.fn(() => executionFlow.push("START")),
        transitionStart: vi.fn(() => executionFlow.push("TRANSITION_START")),
        transitionCancel: vi.fn(() => executionFlow.push("TRANSITION_CANCEL")),
        transitionError: vi.fn(() => executionFlow.push("TRANSITION_ERROR")),
        transitionSuccess: vi.fn(() =>
          executionFlow.push("TRANSITION_SUCCESS"),
        ),
        routerStop: vi.fn(() => executionFlow.push("STOP")),
      };

      // Register listeners with correct event names
      router.addEventListener(events.ROUTER_START, listeners.routerStart);
      router.addEventListener(
        events.TRANSITION_START,
        listeners.transitionStart,
      );
      router.addEventListener(
        events.TRANSITION_CANCEL,
        listeners.transitionCancel,
      );
      router.addEventListener(
        events.TRANSITION_ERROR,
        listeners.transitionError,
      );
      router.addEventListener(
        events.TRANSITION_SUCCESS,
        listeners.transitionSuccess,
      );
      router.addEventListener(events.ROUTER_STOP, listeners.routerStop);

      // Complex flow simulation
      router.invokeEventListeners(events.ROUTER_START);
      router.invokeEventListeners(events.TRANSITION_START, toState, fromState);
      router.invokeEventListeners(events.TRANSITION_CANCEL, toState, fromState);
      router.invokeEventListeners(events.TRANSITION_START, toState, fromState);
      router.invokeEventListeners(
        events.TRANSITION_ERROR,
        toState,
        fromState,
        routerError,
      );
      router.invokeEventListeners(events.TRANSITION_START, toState, fromState);
      router.invokeEventListeners(
        events.TRANSITION_SUCCESS,
        toState,
        fromState,
        navigationOptions,
      );
      router.invokeEventListeners(events.ROUTER_STOP);

      expect(executionFlow).toStrictEqual([
        "START",
        "TRANSITION_START",
        "TRANSITION_CANCEL",
        "TRANSITION_START",
        "TRANSITION_ERROR",
        "TRANSITION_START",
        "TRANSITION_SUCCESS",
        "STOP",
      ]);
    });

    it("should maintain listener state consistency across sequential calls", () => {
      const listenerCallCounts = {
        routerStart: 0,
        transitionStart: 0,
        transitionSuccess: 0,
        routerStop: 0,
      };

      const countingListeners = {
        routerStart: vi.fn(() => listenerCallCounts.routerStart++),
        transitionStart: vi.fn(() => listenerCallCounts.transitionStart++),
        transitionSuccess: vi.fn(() => listenerCallCounts.transitionSuccess++),
        routerStop: vi.fn(() => listenerCallCounts.routerStop++),
      };

      router.addEventListener(
        events.ROUTER_START,
        countingListeners.routerStart,
      );
      router.addEventListener(
        events.TRANSITION_START,
        countingListeners.transitionStart,
      );
      router.addEventListener(
        events.TRANSITION_SUCCESS,
        countingListeners.transitionSuccess,
      );
      router.addEventListener(events.ROUTER_STOP, countingListeners.routerStop);

      const toState = { name: "test", params: {}, path: "/test" };
      const fromState = { name: "prev", params: {}, path: "/prev" };
      const navigationOptions: NavigationOptions = { replace: false };

      // Multiple sequential calls
      for (let i = 0; i < 3; i++) {
        router.invokeEventListeners(events.ROUTER_START);
        router.invokeEventListeners(
          events.TRANSITION_START,
          toState,
          fromState,
        );
        router.invokeEventListeners(
          events.TRANSITION_SUCCESS,
          toState,
          fromState,
          navigationOptions,
        );
        router.invokeEventListeners(events.ROUTER_STOP);
      }

      expect(listenerCallCounts.routerStart).toBe(3);
      expect(listenerCallCounts.transitionStart).toBe(3);
      expect(listenerCallCounts.transitionSuccess).toBe(3);
      expect(listenerCallCounts.routerStop).toBe(3);
    });

    it("should handle error recovery in sequential event processing", () => {
      vi.spyOn(console, "error").mockImplementation(noop);

      const executionResults: string[] = [];
      const toState = { name: "recovery", params: {}, path: "/recovery" };
      const fromState = { name: "error", params: {}, path: "/error" };

      const erroringListener = vi.fn(() => {
        executionResults.push("error");

        throw new Error("Sequential error test");
      });

      const workingListener = vi.fn(() => {
        executionResults.push("working");
      });

      // Register same listeners for multiple events
      [
        events.ROUTER_START,
        events.TRANSITION_START,
        events.ROUTER_STOP,
      ].forEach((eventName) => {
        router.addEventListener(eventName, erroringListener);
        router.addEventListener(eventName, workingListener);
      });

      // Sequential calls with errors
      router.invokeEventListeners(events.ROUTER_START);
      router.invokeEventListeners(events.TRANSITION_START, toState, fromState);
      router.invokeEventListeners(events.ROUTER_STOP);

      expect(executionResults).toStrictEqual([
        "error",
        "working", // ROUTER_START
        "error",
        "working", // TRANSITION_START
        "error",
        "working", // ROUTER_STOP
      ]);
      expect(console.error).toHaveBeenCalledTimes(3);
    });

    it("should preserve argument immutability across sequential calls", () => {
      const originalToState = {
        name: "immutable",
        params: { test: "original" },
        path: "/immutable",
      };
      const originalFromState = {
        name: "previous",
        params: {},
        path: "/previous",
      };
      const originalOptions: NavigationOptions = {
        replace: true,
        metadata: { original: true },
      };

      const modifyingListener = vi.fn((toState, fromState, options) => {
        if (toState) {
          toState.modified = true;
        }
        if (fromState) {
          fromState.modified = true;
        }
        if (options) {
          options.modified = true;
        }
      });

      const checkingListener = vi.fn((toState, fromState, options) => {
        /* eslint-disable vitest/no-conditional-expect */
        if (toState) {
          expect(toState.modified).toBe(true);
        }
        if (fromState) {
          expect(fromState.modified).toBe(true);
        }
        if (options) {
          expect(options.modified).toBe(true);
        }
        /* eslint-enable vitest/no-conditional-expect */
      });

      router.addEventListener(events.TRANSITION_START, modifyingListener);
      router.addEventListener(events.TRANSITION_START, checkingListener);
      router.addEventListener(events.TRANSITION_SUCCESS, modifyingListener);
      router.addEventListener(events.TRANSITION_SUCCESS, checkingListener);

      // First call - objects get modified
      router.invokeEventListeners(
        events.TRANSITION_START,
        originalToState,
        originalFromState,
      );

      // Second call - should receive the same modified objects (same references)
      router.invokeEventListeners(
        events.TRANSITION_SUCCESS,
        originalToState,
        originalFromState,
        originalOptions,
      );

      expect(modifyingListener).toHaveBeenCalledTimes(2);
      expect(checkingListener).toHaveBeenCalledTimes(2);
    });
  });
});
