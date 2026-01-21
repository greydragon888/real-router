import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { events, RouterError } from "@real-router/core";

import { createTestRouter } from "../../../helpers";

import type { Router, NavigationOptions, State } from "@real-router/core";

let router: Router;

describe("invokeEventListeners - Edge cases", () => {
  beforeEach(() => {
    router = createTestRouter();

    router.start();
  });

  afterEach(() => {
    router.stop();
  });

  describe("recursion protection", () => {
    let toState: State;
    let fromState: State;

    beforeEach(() => {
      toState = { name: "test-to", path: "/test-to", params: {} };
      fromState = { name: "test-from", path: "/test-from", params: {} };
    });

    it("should allow nested event calls up to depth 5", () => {
      let depth = 0;
      const recursiveListener = vi.fn(() => {
        depth++;
        if (depth < 5) {
          router.invokeEventListeners(
            events.TRANSITION_START,
            toState,
            fromState,
          );
        }
      });

      router.addEventListener(events.TRANSITION_START, recursiveListener);

      // Should not throw - depth will reach exactly 5
      expect(() => {
        router.invokeEventListeners(
          events.TRANSITION_START,
          toState,
          fromState,
        );
      }).not.toThrowError();

      // Listener called 5 times (depth 1-5)
      expect(recursiveListener).toHaveBeenCalledTimes(5);
      expect(depth).toBe(5);
    });

    it("should stop recursion when MAX_EVENT_DEPTH (5) is exceeded", () => {
      let callCount = 0;
      const recursiveListener = vi.fn(() => {
        callCount++;
        // Always try to recurse - will hit depth limit
        router.invokeEventListeners(
          events.TRANSITION_START,
          toState,
          fromState,
        );
      });

      router.addEventListener(events.TRANSITION_START, recursiveListener);

      // Invoke - recursion should stop at depth 5
      // Error is caught internally and logged, not thrown to caller
      expect(() => {
        router.invokeEventListeners(
          events.TRANSITION_START,
          toState,
          fromState,
        );
      }).not.toThrowError();

      // Should have been called 5 times (depths 1-5)
      // 6th call (depth 5->6) throws error which is caught
      expect(recursiveListener).toHaveBeenCalledTimes(5);
      expect(callCount).toBe(5);
    });

    it("should track depth independently for different event types", () => {
      let startDepth = 0;
      let cancelDepth = 0;

      const startListener = vi.fn(() => {
        startDepth++;
        // Trigger different event type - should have independent depth
        router.invokeEventListeners(
          events.TRANSITION_CANCEL,
          toState,
          fromState,
        );
      });

      const cancelListener = vi.fn(() => {
        cancelDepth++;
        // Don't recurse back - just count
      });

      router.addEventListener(events.TRANSITION_START, startListener);
      router.addEventListener(events.TRANSITION_CANCEL, cancelListener);

      // Should not throw - each event type tracks depth independently
      expect(() => {
        router.invokeEventListeners(
          events.TRANSITION_START,
          toState,
          fromState,
        );
      }).not.toThrowError();

      // startListener called once at depth 1, triggers CANCEL
      expect(startDepth).toBe(1);
      // cancelListener called once when START listener triggers it
      expect(cancelDepth).toBe(1);
    });

    it("should reset depth counter after successful invocation", () => {
      let callCount = 0;
      const listener = vi.fn(() => {
        callCount++;
      });

      router.addEventListener(events.TRANSITION_START, listener);

      // First invocation
      router.invokeEventListeners(events.TRANSITION_START, toState, fromState);

      expect(callCount).toBe(1);

      // Second invocation - depth should have reset, not throw
      expect(() => {
        router.invokeEventListeners(
          events.TRANSITION_START,
          toState,
          fromState,
        );
      }).not.toThrowError();

      expect(callCount).toBe(2);
    });

    it("should reset depth counter even after error in listener", () => {
      let callCount = 0;
      const errorListener = vi.fn(() => {
        callCount++;

        throw new Error("Listener error");
      });

      router.addEventListener(events.TRANSITION_START, errorListener);

      // First invocation - listener throws but depth should reset
      router.invokeEventListeners(events.TRANSITION_START, toState, fromState);

      expect(callCount).toBe(1);

      // Second invocation - depth reset, should not accumulate
      router.invokeEventListeners(events.TRANSITION_START, toState, fromState);

      expect(callCount).toBe(2);

      // Verify depth didn't accumulate
      let recursiveCallCount = 0;
      const recursiveListener = vi.fn(() => {
        recursiveCallCount++;
        router.invokeEventListeners(
          events.TRANSITION_START,
          toState,
          fromState,
        );
      });

      router.addEventListener(events.TRANSITION_START, recursiveListener);

      // Should be able to recurse 5 times still (depth was reset)
      // Error is caught internally, doesn't throw to caller
      expect(() => {
        router.invokeEventListeners(
          events.TRANSITION_START,
          toState,
          fromState,
        );
      }).not.toThrowError();

      // recursiveListener called 5 times, errorListener also called each time
      expect(recursiveListener).toHaveBeenCalledTimes(5);
      expect(recursiveCallCount).toBe(5);
    });
  });

  // 🔴 CRITICAL: State immutability passed through invokeEventListeners
  // NOTE: States are now frozen in makeState(), not in invokeEventListeners.
  // invokeEventListeners receives pre-frozen states and passes them directly to listeners.
  describe("State immutability (pre-frozen states)", () => {
    let toState: State;
    let fromState: State;

    // Helper to deep freeze objects (simulating makeState behavior)
    const deepFreeze = <T extends object>(obj: T): T => {
      Object.freeze(obj);

      for (const value of Object.values(obj)) {
        if (value && typeof value === "object") {
          deepFreeze(value);
        }
      }

      return obj;
    };

    beforeEach(() => {
      // States are pre-frozen (as they would be from makeState)
      toState = deepFreeze({
        name: "test-to",
        path: "/test-to",
        params: { userId: "123", nested: { value: "data" } },
      });
      fromState = deepFreeze({
        name: "test-from",
        path: "/test-from",
        params: {},
      });
    });

    it("should freeze toState object at root level", () => {
      const listener = vi.fn((receivedToState: State) => {
        expect(Object.isFrozen(receivedToState)).toBe(true);

        expect(() => {
          (receivedToState as any).name = "modified";
        }).toThrowError();

        expect(() => {
          (receivedToState as any).newProp = "test";
        }).toThrowError();
      });

      router.addEventListener(events.TRANSITION_START, listener);
      router.invokeEventListeners(events.TRANSITION_START, toState, fromState);

      expect(listener).toHaveBeenCalled();
    });

    it("should freeze fromState object at root level", () => {
      const listener = vi.fn((_toState: State, receivedFromState?: State) => {
        expect(receivedFromState).toBeDefined();
        expect(Object.isFrozen(receivedFromState!)).toBe(true);

        expect(() => {
          (receivedFromState as any).name = "modified";
        }).toThrowError();
      });

      router.addEventListener(events.TRANSITION_START, listener);
      router.invokeEventListeners(events.TRANSITION_START, toState, fromState);

      expect(listener).toHaveBeenCalled();
    });

    it("should deeply freeze nested params object", () => {
      const listener = vi.fn((receivedToState: State) => {
        expect(Object.isFrozen(receivedToState.params)).toBe(true);

        expect(() => {
          (receivedToState.params as any).userId = "456";
        }).toThrowError();

        // Deep freeze - nested objects should also be frozen
        const nested = (receivedToState.params as any).nested;

        expect(Object.isFrozen(nested)).toBe(true);

        expect(() => {
          nested.value = "modified";
        }).toThrowError();
      });

      router.addEventListener(events.TRANSITION_START, listener);
      router.invokeEventListeners(events.TRANSITION_START, toState, fromState);

      expect(listener).toHaveBeenCalled();
    });

    it("should freeze opts parameter in TRANSITION_SUCCESS", () => {
      const opts = { replace: false, custom: { nested: "value" } };
      const listener = vi.fn(
        (
          _toState: State,
          _fromState: State | undefined,
          receivedOpts?: NavigationOptions,
        ) => {
          expect(receivedOpts).toBeDefined();
          expect(Object.isFrozen(receivedOpts!)).toBe(true);

          expect(() => {
            (receivedOpts as any).replace = true;
          }).toThrowError();

          // Deep freeze - nested objects
          const custom = (receivedOpts as any).custom;

          expect(Object.isFrozen(custom)).toBe(true);

          expect(() => {
            custom.nested = "modified";
          }).toThrowError();
        },
      );

      router.addEventListener(events.TRANSITION_SUCCESS, listener);
      router.invokeEventListeners(
        events.TRANSITION_SUCCESS,
        toState,
        fromState,
        opts,
      );

      expect(listener).toHaveBeenCalled();
    });

    it("should freeze error parameter in TRANSITION_ERROR", () => {
      const error = new RouterError("TEST_ERROR", { message: "Test error" });

      const listener = vi.fn(
        (
          _toState: State,
          _fromState: State | undefined,
          receivedError?: RouterError,
        ) => {
          expect(receivedError).toBeDefined();
          expect(Object.isFrozen(receivedError!)).toBe(true);

          expect(() => {
            (receivedError as any).code = "MODIFIED";
          }).toThrowError();
        },
      );

      router.addEventListener(events.TRANSITION_ERROR, listener);
      router.invokeEventListeners(
        events.TRANSITION_ERROR,
        toState,
        fromState,
        error,
      );

      expect(listener).toHaveBeenCalled();
    });

    it("should pass through pre-frozen states without modification", () => {
      const listener = vi.fn();

      router.addEventListener(events.TRANSITION_START, listener);
      router.invokeEventListeners(events.TRANSITION_START, toState, fromState);

      // States remain frozen as they were passed in
      expect(Object.isFrozen(toState)).toBe(true);
      expect(Object.isFrozen(fromState)).toBe(true);
    });

    it("should pass the same state objects to listeners (no cloning)", () => {
      const listener = vi.fn();

      router.addEventListener(events.TRANSITION_START, listener);
      router.invokeEventListeners(events.TRANSITION_START, toState, fromState);

      expect(listener).toHaveBeenCalledTimes(1);

      const [receivedToState, receivedFromState] = listener.mock.calls[0];

      // Listeners receive the exact same objects (no cloning in invokeEventListeners)
      expect(receivedToState).toBe(toState);
      expect(receivedFromState).toBe(fromState);

      // States are frozen (as they were pre-frozen)
      expect(Object.isFrozen(receivedToState)).toBe(true);
      expect(Object.isFrozen(receivedFromState)).toBe(true);
    });
  });

  // 🔴 CRITICAL: Depth counter consistency in finally blocks
  describe("depth counter consistency", () => {
    let toState: State;
    let fromState: State;

    beforeEach(() => {
      toState = { name: "test-to", path: "/test-to", params: {} };
      fromState = { name: "test-from", path: "/test-from", params: {} };
    });

    it("should decrement depth counter even when listener throws", () => {
      const errorListener = vi.fn(() => {
        throw new Error("Listener error");
      });

      let recursiveCallCount = 0;
      const recursiveListener = vi.fn(() => {
        recursiveCallCount++;
        router.invokeEventListeners(
          events.TRANSITION_START,
          toState,
          fromState,
        );
      });

      router.addEventListener(events.TRANSITION_START, errorListener);
      router.addEventListener(events.TRANSITION_START, recursiveListener);

      // First call - errorListener throws but shouldn't affect depth tracking
      router.invokeEventListeners(events.TRANSITION_START, toState, fromState);

      // Second call - should still be able to recurse 5 times (depth was reset)
      // Error is caught internally, doesn't throw to caller
      expect(() => {
        router.invokeEventListeners(
          events.TRANSITION_START,
          toState,
          fromState,
        );
      }).not.toThrowError();

      // Should have recursed 5 times in each call before hitting limit
      // First call: recursiveListener recurses 5 times (depths 1-5)
      // Second call: recursiveListener recurses another 5 times (depths 1-5, reset)
      expect(recursiveListener).toHaveBeenCalled();
      expect(recursiveCallCount).toBe(10); // 5 from first call + 5 from second call
    });

    it("should maintain correct depth across multiple concurrent invocations", () => {
      let depth1 = 0;
      let depth2 = 0;

      const listener1 = vi.fn(() => {
        depth1++;
        if (depth1 < 3) {
          router.invokeEventListeners(
            events.TRANSITION_START,
            toState,
            fromState,
          );
        }
      });

      const listener2 = vi.fn(() => {
        depth2++;
        if (depth2 < 3) {
          router.invokeEventListeners(
            events.TRANSITION_CANCEL,
            toState,
            fromState,
          );
        }
      });

      router.addEventListener(events.TRANSITION_START, listener1);
      router.addEventListener(events.TRANSITION_CANCEL, listener2);

      // Invoke both - each should track depth independently
      router.invokeEventListeners(events.TRANSITION_START, toState, fromState);
      router.invokeEventListeners(events.TRANSITION_CANCEL, toState, fromState);

      expect(depth1).toBe(3);
      expect(depth2).toBe(3);
    });
  });

  // 🟡 IMPORTANT: Circular references in State params
  describe("circular references in State params", () => {
    let toState: State;
    let fromState: State;

    beforeEach(() => {
      fromState = { name: "test-from", path: "/test-from", params: {} };
    });

    it("should reject circular references in State.params", () => {
      const params: any = { userId: "123" };

      params.self = params; // Circular reference

      toState = { name: "test-to", path: "/test-to", params };

      router.addEventListener(events.TRANSITION_START, vi.fn());

      // Circular references are invalid (cannot be serialized)
      // Should throw TypeError for invalid State
      expect(() => {
        router.invokeEventListeners(
          events.TRANSITION_START,
          toState,
          fromState,
        );
      }).toThrowError(TypeError);
    });

    it("should reject nested circular references in State.params", () => {
      const params: any = { userId: "123", nested: {} };

      params.nested.parent = params; // Circular reference

      toState = { name: "test-to", path: "/test-to", params };

      router.addEventListener(events.TRANSITION_START, vi.fn());

      // Circular references are invalid (cannot be serialized)
      // Should throw TypeError for invalid State
      expect(() => {
        router.invokeEventListeners(
          events.TRANSITION_START,
          toState,
          fromState,
        );
      }).toThrowError(TypeError);
    });
  });

  // 🔴 CRITICAL: Invalid event name validation
  describe("invalid event name validation", () => {
    it("should throw Error for non-existent event name", () => {
      expect(() => {
        router.invokeEventListeners(
          // @ts-expect-error - Testing invalid event name
          "FAKE_EVENT",
        );
      }).toThrowError("Invalid event name: FAKE_EVENT");
    });

    it("should throw Error for empty string event name", () => {
      expect(() => {
        router.invokeEventListeners(
          // @ts-expect-error - Testing invalid event name
          "",
        );
      }).toThrowError("Invalid event name: ");
    });

    it("should throw Error for numeric event name", () => {
      expect(() => {
        router.invokeEventListeners(
          // @ts-expect-error - Testing invalid event name
          123,
        );
      }).toThrowError("Invalid event name: 123");
    });

    describe("prototype pollution prevention", () => {
      it("should throw Error for 'constructor' event name", () => {
        expect(() => {
          router.invokeEventListeners(
            // @ts-expect-error - Testing prototype pollution
            "constructor",
          );
        }).toThrowError("Invalid event name: constructor");
      });

      it("should throw Error for '__proto__' event name", () => {
        expect(() => {
          router.invokeEventListeners(
            // @ts-expect-error - Testing prototype pollution
            "__proto__",
          );
        }).toThrowError("Invalid event name: __proto__");
      });

      it("should throw Error for 'hasOwnProperty' event name", () => {
        expect(() => {
          router.invokeEventListeners(
            // @ts-expect-error - Testing prototype pollution
            "hasOwnProperty",
          );
        }).toThrowError("Invalid event name: hasOwnProperty");
      });

      it("should throw Error for 'toString' event name", () => {
        expect(() => {
          router.invokeEventListeners(
            // @ts-expect-error - Testing prototype pollution
            "toString",
          );
        }).toThrowError("Invalid event name: toString");
      });

      it("should throw Error for 'valueOf' event name", () => {
        expect(() => {
          router.invokeEventListeners(
            // @ts-expect-error - Testing prototype pollution
            "valueOf",
          );
        }).toThrowError("Invalid event name: valueOf");
      });

      it("should not call any listeners when event name is invalid", () => {
        const listener = vi.fn();

        // Register listener for a valid event
        router.addEventListener(events.TRANSITION_START, listener);

        // Try to invoke with invalid event name
        expect(() => {
          router.invokeEventListeners(
            // @ts-expect-error - Testing prototype pollution
            "constructor",
          );
        }).toThrowError();

        // Listener should not be called
        expect(listener).not.toHaveBeenCalled();
      });
    });

    it("should accept all valid event names", () => {
      const toState = { name: "test", path: "/test", params: {} };
      const fromState = { name: "from", path: "/from", params: {} };
      const error = new RouterError("TEST", { message: "test" });
      const options = { replace: false };

      // All valid events should work without throwing
      expect(() => {
        router.invokeEventListeners(events.ROUTER_START);
      }).not.toThrowError();

      expect(() => {
        router.invokeEventListeners(events.ROUTER_STOP);
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
          events.TRANSITION_CANCEL,
          toState,
          fromState,
        );
      }).not.toThrowError();

      expect(() => {
        router.invokeEventListeners(
          events.TRANSITION_SUCCESS,
          toState,
          fromState,
          options,
        );
      }).not.toThrowError();

      expect(() => {
        router.invokeEventListeners(
          events.TRANSITION_ERROR,
          toState,
          fromState,
          error,
        );
      }).not.toThrowError();
    });
  });

  // 🔴 CRITICAL: Invalid fromState validation
  describe("invalid fromState validation", () => {
    const validToState = { name: "test", path: "/test", params: {} };
    const invalidFromState = { name: "invalid" }; // missing path and params

    it("should throw TypeError for invalid fromState in TRANSITION_START", () => {
      expect(() => {
        router.invokeEventListeners(
          events.TRANSITION_START,
          validToState,
          // @ts-expect-error - Testing invalid fromState
          invalidFromState,
        );
      }).toThrowError(TypeError);
      expect(() => {
        router.invokeEventListeners(
          events.TRANSITION_START,
          validToState,
          // @ts-expect-error - Testing invalid fromState
          invalidFromState,
        );
      }).toThrowError(/fromState is invalid/);
    });

    it("should throw TypeError for invalid fromState in TRANSITION_CANCEL", () => {
      expect(() => {
        router.invokeEventListeners(
          events.TRANSITION_CANCEL,
          validToState,
          // @ts-expect-error - Testing invalid fromState
          invalidFromState,
        );
      }).toThrowError(TypeError);
      expect(() => {
        router.invokeEventListeners(
          events.TRANSITION_CANCEL,
          validToState,
          // @ts-expect-error - Testing invalid fromState
          invalidFromState,
        );
      }).toThrowError(/fromState is invalid/);
    });

    it("should throw TypeError for invalid fromState in TRANSITION_SUCCESS", () => {
      const options = { replace: false };

      expect(() => {
        router.invokeEventListeners(
          events.TRANSITION_SUCCESS,
          validToState,
          // @ts-expect-error - Testing invalid fromState
          invalidFromState,
          options,
        );
      }).toThrowError(TypeError);
      expect(() => {
        router.invokeEventListeners(
          events.TRANSITION_SUCCESS,
          validToState,
          // @ts-expect-error - Testing invalid fromState
          invalidFromState,
          options,
        );
      }).toThrowError(/fromState is invalid/);
    });

    it("should throw TypeError for invalid fromState in TRANSITION_ERROR", () => {
      const error = new RouterError("TEST", { message: "test" });

      expect(() => {
        router.invokeEventListeners(
          events.TRANSITION_ERROR,
          validToState,
          // @ts-expect-error - Testing invalid fromState
          invalidFromState,
          error,
        );
      }).toThrowError(TypeError);
      expect(() => {
        router.invokeEventListeners(
          events.TRANSITION_ERROR,
          validToState,
          // @ts-expect-error - Testing invalid fromState
          invalidFromState,
          error,
        );
      }).toThrowError(/fromState is invalid/);
    });

    it("should not call listeners when fromState validation fails", () => {
      const listener = vi.fn();

      router.addEventListener(events.TRANSITION_START, listener);

      expect(() => {
        router.invokeEventListeners(
          events.TRANSITION_START,
          validToState,
          // @ts-expect-error - Testing invalid fromState
          invalidFromState,
        );
      }).toThrowError(TypeError);

      expect(listener).not.toHaveBeenCalled();
    });

    it("should accept undefined fromState (optional parameter)", () => {
      expect(() => {
        router.invokeEventListeners(
          events.TRANSITION_START,
          validToState,
          undefined,
        );
      }).not.toThrowError();
    });
  });

  // 🟡 BOUNDARY: State with null prototype
  describe("State with null prototype", () => {
    it("should accept State created with Object.create(null)", () => {
      const nullProtoState = Object.create(null) as State;

      nullProtoState.name = "test";
      nullProtoState.path = "/test";
      nullProtoState.params = {};

      expect(() => {
        router.invokeEventListeners(
          events.TRANSITION_START,
          nullProtoState,
          undefined,
        );
      }).not.toThrowError();
    });

    it("should pass null prototype State to listeners correctly", () => {
      const nullProtoState = Object.create(null) as State;

      nullProtoState.name = "nullproto";
      nullProtoState.path = "/nullproto";
      nullProtoState.params = { id: "123" };

      const listener = vi.fn();

      router.addEventListener(events.TRANSITION_START, listener);
      router.invokeEventListeners(
        events.TRANSITION_START,
        nullProtoState,
        undefined,
      );

      expect(listener).toHaveBeenCalledTimes(1);
      // Verify the state was passed (may be cloned)
      expect(listener.mock.calls[0][0]).toMatchObject({
        name: "nullproto",
        path: "/nullproto",
        params: { id: "123" },
      });
    });

    it("should handle null prototype State in fromState position", () => {
      const toState = { name: "to", path: "/to", params: {} };
      const nullProtoFromState = Object.create(null) as State;

      nullProtoFromState.name = "from";
      nullProtoFromState.path = "/from";
      nullProtoFromState.params = {};

      const listener = vi.fn();

      router.addEventListener(events.TRANSITION_START, listener);

      expect(() => {
        router.invokeEventListeners(
          events.TRANSITION_START,
          toState,
          nullProtoFromState,
        );
      }).not.toThrowError();

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("should pass through unfrozen null prototype State without freezing", () => {
      // NOTE: invokeEventListeners no longer freezes states.
      // States should be pre-frozen from makeState() in the normal flow.
      // This test documents that null prototype states pass through as-is.
      const nullProtoState = Object.create(null) as State;

      nullProtoState.name = "unfrozen";
      nullProtoState.path = "/unfrozen";
      nullProtoState.params = { nested: { value: "test" } };

      let receivedState: State | undefined;
      const listener = vi.fn((state: State) => {
        receivedState = state;
      });

      router.addEventListener(events.TRANSITION_START, listener);
      router.invokeEventListeners(
        events.TRANSITION_START,
        nullProtoState,
        undefined,
      );

      expect(receivedState).toBeDefined();
      // State is passed through as-is (not frozen by invokeEventListeners)
      expect(receivedState).toBe(nullProtoState);
      expect(Object.isFrozen(receivedState)).toBe(false);
    });
  });

  // 🟡 BOUNDARY: Frozen State input
  describe("Frozen State input", () => {
    it("should accept already frozen State as toState", () => {
      const frozenState = Object.freeze({
        name: "frozen",
        path: "/frozen",
        params: Object.freeze({}),
      });

      expect(() => {
        router.invokeEventListeners(
          events.TRANSITION_START,
          frozenState,
          undefined,
        );
      }).not.toThrowError();
    });

    it("should accept already frozen State as fromState", () => {
      const toState = { name: "to", path: "/to", params: {} };
      const frozenFromState = Object.freeze({
        name: "frozen-from",
        path: "/frozen-from",
        params: Object.freeze({}),
      });

      expect(() => {
        router.invokeEventListeners(
          events.TRANSITION_START,
          toState,
          frozenFromState,
        );
      }).not.toThrowError();
    });

    it("should pass through frozen State directly to listeners (no cloning)", () => {
      // NOTE: invokeEventListeners no longer clones states.
      // States are passed directly to listeners.
      const frozenState = Object.freeze({
        name: "frozen",
        path: "/frozen",
        params: Object.freeze({ key: "value" }),
      });

      let receivedState: State | undefined;
      const listener = vi.fn((state: State) => {
        receivedState = state;
      });

      router.addEventListener(events.TRANSITION_START, listener);
      router.invokeEventListeners(
        events.TRANSITION_START,
        frozenState,
        undefined,
      );

      expect(receivedState).toBeDefined();
      // Should be the same object (no cloning)
      expect(receivedState).toBe(frozenState);
      // Still frozen
      expect(Object.isFrozen(receivedState)).toBe(true);
    });

    it("should work with deeply frozen State", () => {
      const deeplyFrozen = Object.freeze({
        name: "deep",
        path: "/deep",
        params: Object.freeze({
          nested: Object.freeze({
            level: Object.freeze({
              value: "deep",
            }),
          }),
        }),
      });

      const listener = vi.fn();

      router.addEventListener(events.TRANSITION_START, listener);

      expect(() => {
        router.invokeEventListeners(
          events.TRANSITION_START,
          deeplyFrozen,
          undefined,
        );
      }).not.toThrowError();

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("should handle frozen State in TRANSITION_SUCCESS", () => {
      const frozenToState = Object.freeze({
        name: "success",
        path: "/success",
        params: Object.freeze({}),
      });
      const frozenFromState = Object.freeze({
        name: "from",
        path: "/from",
        params: Object.freeze({}),
      });
      const options = { replace: false };

      expect(() => {
        router.invokeEventListeners(
          events.TRANSITION_SUCCESS,
          frozenToState,
          frozenFromState,
          options,
        );
      }).not.toThrowError();
    });
  });

  // 🟡 BOUNDARY: RouterError subclass
  describe("RouterError subclass", () => {
    class CustomRouterError extends RouterError {
      customField: string;

      constructor(
        code: string,
        options: { message: string },
        customValue: string,
      ) {
        super(code, options);
        this.customField = customValue;
      }
    }

    it("should accept RouterError subclass in TRANSITION_ERROR", () => {
      const toState = { name: "error", path: "/error", params: {} };
      const customError = new CustomRouterError(
        "CUSTOM_ERROR",
        { message: "Custom error message" },
        "custom-value",
      );

      expect(() => {
        router.invokeEventListeners(
          events.TRANSITION_ERROR,
          toState,
          undefined,
          customError,
        );
      }).not.toThrowError();
    });

    it("should pass RouterError subclass to listeners", () => {
      const toState = { name: "error", path: "/error", params: {} };
      const customError = new CustomRouterError(
        "CUSTOM_ERROR",
        { message: "test" },
        "custom-field-value",
      );

      let receivedError: RouterError | undefined;
      const listener = vi.fn(
        (
          _to: State | undefined,
          _from: State | undefined,
          err: RouterError,
        ) => {
          receivedError = err;
        },
      );

      router.addEventListener(events.TRANSITION_ERROR, listener);
      router.invokeEventListeners(
        events.TRANSITION_ERROR,
        toState,
        undefined,
        customError,
      );

      expect(listener).toHaveBeenCalledTimes(1);
      expect(receivedError).toBe(customError);
      expect(receivedError).toBeInstanceOf(RouterError);
      expect(receivedError).toBeInstanceOf(CustomRouterError);
      expect((receivedError as CustomRouterError).customField).toBe(
        "custom-field-value",
      );
    });

    it("should validate RouterError subclass with instanceof", () => {
      const toState = { name: "test", path: "/test", params: {} };
      const customError = new CustomRouterError(
        "TEST",
        { message: "test" },
        "value",
      );

      // instanceof should work for subclass
      expect(customError instanceof RouterError).toBe(true);

      // Method should accept it
      const listener = vi.fn();

      router.addEventListener(events.TRANSITION_ERROR, listener);
      router.invokeEventListeners(
        events.TRANSITION_ERROR,
        toState,
        undefined,
        customError,
      );

      expect(listener).toHaveBeenCalledWith(
        expect.any(Object),
        undefined,
        customError,
      );
    });

    it("should preserve custom properties on RouterError subclass", () => {
      const toState = { name: "test", path: "/test", params: {} };
      const customError = new CustomRouterError(
        "PRESERVED",
        { message: "preserved message" },
        "preserved-custom-value",
      );

      const listener = vi.fn();

      router.addEventListener(events.TRANSITION_ERROR, listener);
      router.invokeEventListeners(
        events.TRANSITION_ERROR,
        toState,
        undefined,
        customError,
      );

      const passedError = listener.mock.calls[0][2] as CustomRouterError;

      expect(passedError.code).toBe("PRESERVED");
      expect(passedError.customField).toBe("preserved-custom-value");
    });
  });

  // 🟢 UNUSUAL INPUT: Proxy as State
  // NOTE: Since state freezing moved to makeState(), Proxy objects now work in invokeEventListeners.
  // Proxy states pass isState() validation and are dispatched to listeners without cloning.
  describe("Proxy as State", () => {
    it("should accept Proxy object as toState (no cloning in invokeEventListeners)", () => {
      const proxyState = new Proxy(
        { name: "proxy", path: "/proxy", params: {} },
        {
          get(target, prop) {
            return Reflect.get(target, prop);
          },
        },
      );

      const listener = vi.fn();

      router.addEventListener(events.TRANSITION_START, listener);

      // Proxy states now work - no structuredClone is called
      expect(() => {
        router.invokeEventListeners(
          events.TRANSITION_START,
          proxyState,
          undefined,
        );
      }).not.toThrowError();

      expect(listener).toHaveBeenCalledTimes(1);

      const [receivedState] = listener.mock.calls[0];

      // Listener receives the same Proxy object
      expect(receivedState).toBe(proxyState);
    });

    it("should accept Proxy object as fromState", () => {
      const toState = { name: "to", path: "/to", params: {} };
      const proxyFromState = new Proxy(
        { name: "proxy-from", path: "/proxy-from", params: {} },
        {},
      );

      const listener = vi.fn();

      router.addEventListener(events.TRANSITION_START, listener);

      // Proxy states now work
      expect(() => {
        router.invokeEventListeners(
          events.TRANSITION_START,
          toState,
          proxyFromState,
        );
      }).not.toThrowError();

      expect(listener).toHaveBeenCalledTimes(1);

      const [, receivedFromState] = listener.mock.calls[0];

      expect(receivedFromState).toBe(proxyFromState);
    });

    it("should call listeners with Proxy State objects", () => {
      const proxyState = new Proxy(
        { name: "proxy", path: "/proxy", params: {} },
        {},
      );

      const listener = vi.fn();

      router.addEventListener(events.TRANSITION_START, listener);
      router.invokeEventListeners(
        events.TRANSITION_START,
        proxyState,
        undefined,
      );

      // Listener should be called with the Proxy state
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener.mock.calls[0][0]).toBe(proxyState);
    });

    it("should accept Proxy State in TRANSITION_SUCCESS", () => {
      const proxyToState = new Proxy(
        { name: "success", path: "/success", params: {} },
        {},
      );
      const options = { replace: true };
      const listener = vi.fn();

      router.addEventListener(events.TRANSITION_SUCCESS, listener);

      expect(() => {
        router.invokeEventListeners(
          events.TRANSITION_SUCCESS,
          proxyToState,
          undefined,
          options,
        );
      }).not.toThrowError();

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("should accept Proxy State in TRANSITION_ERROR", () => {
      const proxyToState = new Proxy(
        { name: "error", path: "/error", params: {} },
        {},
      );
      const error = new RouterError("TEST", { message: "test" });
      const listener = vi.fn();

      router.addEventListener(events.TRANSITION_ERROR, listener);

      expect(() => {
        router.invokeEventListeners(
          events.TRANSITION_ERROR,
          proxyToState,
          undefined,
          error,
        );
      }).not.toThrowError();

      expect(listener).toHaveBeenCalledTimes(1);
    });
  });
});
