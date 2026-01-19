import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RouterError } from "router6";

import { createObservableTestRouter, events } from "./setup";

import type { Router } from "router6";

describe("core/observable/addEventListener", () => {
  let router: Router;

  beforeEach(() => {
    router = createObservableTestRouter();
  });

  afterEach(() => {
    router.stop();
    router = null as any;
  });

  describe("old tests", () => {
    it("should add and trigger event listener", () => {
      const cb = vi.fn();
      const evtName = events.ROUTER_START;

      router.addEventListener(evtName, cb);
      router.invokeEventListeners(evtName);

      expect(cb).toHaveBeenCalledTimes(1);
    });

    it("should pass (toState, fromState) to TRANSITION_START listeners", () => {
      const cb = vi.fn();
      const evtName = events.TRANSITION_START;

      router.addEventListener(evtName, cb);
      const toState = { name: "a", path: "/a", params: {} } as any;
      const fromState = { name: "b", path: "/a", params: {} } as any;

      router.invokeEventListeners(evtName, toState, fromState);

      expect(cb).toHaveBeenCalledWith(toState, fromState);
    });

    it("should pass (toState, fromState) to TRANSITION_CANCEL listeners", () => {
      const cb = vi.fn();
      const evtName = events.TRANSITION_CANCEL;

      router.addEventListener(evtName, cb);

      const to = { name: "foo", path: "/foo", params: {} } as any;
      const from = { name: "bar", path: "/bar", params: {} } as any;

      router.invokeEventListeners(evtName, to, from);

      expect(cb).toHaveBeenCalledWith(to, from);
    });

    it("should pass (toState, fromState, options) to TRANSITION_SUCCESS listeners", () => {
      const cb = vi.fn();
      const evtName = events.TRANSITION_SUCCESS;

      router.addEventListener(evtName, cb);
      const toState = { name: "a", path: "/a", params: {} } as any;
      const fromState = { name: "b", path: "/a", params: {} } as any;
      const opts = { reload: true };

      router.invokeEventListeners(evtName, toState, fromState, opts);

      expect(cb).toHaveBeenCalledWith(toState, fromState, opts);
    });

    it("should pass (toState, fromState, error) to TRANSITION_ERROR listeners", () => {
      const cb = vi.fn();
      const evtName = events.TRANSITION_ERROR;

      router.addEventListener(evtName, cb);
      const toState = { name: "a", path: "/a", params: {} } as any;
      const fromState = { name: "b", path: "/a", params: {} } as any;
      const error = new RouterError("ERR");

      router.invokeEventListeners(evtName, toState, fromState, error);

      expect(cb).toHaveBeenCalledWith(toState, fromState, error);
    });

    it("should pass no args to ROUTER_START listeners", () => {
      const cb = vi.fn();
      const evtName = events.ROUTER_START;

      router.addEventListener(evtName, cb);

      router.invokeEventListeners(evtName);

      expect(cb).toHaveBeenCalledWith();
    });

    it("should pass no args to ROUTER_STOP listeners", () => {
      const cb = vi.fn();
      const evtName = events.ROUTER_STOP;

      router.addEventListener(evtName, cb);

      router.invokeEventListeners(evtName);

      expect(cb).toHaveBeenCalledWith();
    });
  });

  // 🔴 CRITICAL: Duplicate protection
  describe("duplicate protection", () => {
    it("should throw error when registering same callback twice", () => {
      const cb = vi.fn();

      router.addEventListener(events.TRANSITION_START, cb);

      expect(() => {
        router.addEventListener(events.TRANSITION_START, cb);
      }).toThrowError("Listener already exists");
      expect(() => {
        router.addEventListener(events.TRANSITION_START, cb);
      }).toThrowError(events.TRANSITION_START);
    });

    it("should allow same callback for different events", () => {
      const cb = vi.fn();

      expect(() => {
        router.addEventListener(events.TRANSITION_START, cb);
        router.addEventListener(events.TRANSITION_SUCCESS, cb);
        router.addEventListener(events.ROUTER_START, cb);
      }).not.toThrowError();

      // Verify all registered
      router.invokeEventListeners(
        events.TRANSITION_START,
        { name: "a", path: "/a", params: {} } as any,
        { name: "b", path: "/b", params: {} } as any,
      );
      router.invokeEventListeners(
        events.TRANSITION_SUCCESS,
        { name: "a", path: "/a", params: {} } as any,
        { name: "b", path: "/b", params: {} } as any,
        {},
      );
      router.invokeEventListeners(events.ROUTER_START);

      expect(cb).toHaveBeenCalledTimes(3);
    });

    it("should allow different callbacks for same event", () => {
      const cb1 = vi.fn();
      const cb2 = vi.fn();
      const cb3 = vi.fn();

      expect(() => {
        router.addEventListener(events.ROUTER_START, cb1);
        router.addEventListener(events.ROUTER_START, cb2);
        router.addEventListener(events.ROUTER_START, cb3);
      }).not.toThrowError();

      router.invokeEventListeners(events.ROUTER_START);

      expect(cb1).toHaveBeenCalledTimes(1);
      expect(cb2).toHaveBeenCalledTimes(1);
      expect(cb3).toHaveBeenCalledTimes(1);
    });

    it("should detect duplicates with arrow functions", () => {
      const cb = () => {
        console.log("test");
      };

      router.addEventListener(events.ROUTER_START, cb);

      expect(() => {
        router.addEventListener(events.ROUTER_START, cb);
      }).toThrowError("Listener already exists");
    });

    it("should detect duplicates with class methods", () => {
      class Handler {
        method = vi.fn();
      }

      const handler = new Handler();

      router.addEventListener(events.ROUTER_START, handler.method);

      expect(() => {
        router.addEventListener(events.ROUTER_START, handler.method);
      }).toThrowError("Listener already exists");
    });

    it("should allow re-registration after unsubscribe", () => {
      const cb = vi.fn();

      const unsub = router.addEventListener(events.ROUTER_START, cb);

      unsub();

      expect(() => {
        router.addEventListener(events.ROUTER_START, cb);
      }).not.toThrowError();

      router.invokeEventListeners(events.ROUTER_START);

      expect(cb).toHaveBeenCalledTimes(1);
    });
  });

  // 🔴 CRITICAL: Listener limits (1000 warning, 10000 error)
  describe("listener limits", () => {
    it("should throw error at 10000 listeners (set.size >= 10000)", () => {
      // Register exactly 10000 listeners
      for (let i = 0; i < 10_000; i++) {
        router.addEventListener(events.ROUTER_START, () => {});
      }

      // 10001st should throw (because set.size >= 10000)
      expect(() => {
        router.addEventListener(events.ROUTER_START, () => {});
      }).toThrowError("Maximum listener limit");
      expect(() => {
        router.addEventListener(events.ROUTER_START, () => {});
      }).toThrowError("10");
    });

    it("should check limit before registration (no partial add)", () => {
      // Fill to limit
      for (let i = 0; i < 10_000; i++) {
        router.addEventListener(events.ROUTER_START, () => {});
      }

      const cb = vi.fn();

      expect(() => {
        router.addEventListener(events.ROUTER_START, cb);
      }).toThrowError("Maximum listener limit");

      // Callback should NOT be registered
      router.invokeEventListeners(events.ROUTER_START);

      expect(cb).not.toHaveBeenCalled();
    });

    it("should track limits per event independently", () => {
      // Fill ROUTER_START to limit
      for (let i = 0; i < 10_000; i++) {
        router.addEventListener(events.ROUTER_START, () => {});
      }

      // Should still be able to add to other events
      expect(() => {
        router.addEventListener(events.ROUTER_STOP, () => {});
        router.addEventListener(events.TRANSITION_START, () => {});
      }).not.toThrowError();
    });
  });

  // 🔴 CRITICAL: Error isolation in callbacks
  describe("error isolation", () => {
    it("should continue executing remaining listeners when one throws", () => {
      const cb1 = vi.fn();
      const cb2 = vi.fn(() => {
        throw new Error("Callback 2 error");
      });
      const cb3 = vi.fn();

      router.addEventListener(events.ROUTER_START, cb1);
      router.addEventListener(events.ROUTER_START, cb2);
      router.addEventListener(events.ROUTER_START, cb3);

      // Should not throw to caller
      expect(() => {
        router.invokeEventListeners(events.ROUTER_START);
      }).not.toThrowError();

      // All callbacks should be called
      expect(cb1).toHaveBeenCalledTimes(1);
      expect(cb2).toHaveBeenCalledTimes(1);
      expect(cb3).toHaveBeenCalledTimes(1);
    });

    it("should log errors from failing listeners", () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const error = new Error("Test error");
      const cb = vi.fn(() => {
        throw error;
      });

      router.addEventListener(events.ROUTER_START, cb);
      router.invokeEventListeners(events.ROUTER_START);

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining("Error in listener"),
        error,
      );

      errorSpy.mockRestore();
    });

    it("should isolate errors across different listeners", () => {
      const cb1 = vi.fn(() => {
        throw new Error("Error 1");
      });
      const cb2 = vi.fn(() => {
        throw new Error("Error 2");
      });
      const cb3 = vi.fn();

      router.addEventListener(events.ROUTER_START, cb1);
      router.addEventListener(events.ROUTER_START, cb2);
      router.addEventListener(events.ROUTER_START, cb3);

      expect(() => {
        router.invokeEventListeners(events.ROUTER_START);
      }).not.toThrowError();

      expect(cb1).toHaveBeenCalled();
      expect(cb2).toHaveBeenCalled();
      expect(cb3).toHaveBeenCalled();
    });
  });

  // 🟡 IMPORTANT: Parameter validation
  describe("parameter validation", () => {
    it("should throw TypeError when callback is not a function", () => {
      expect(() => {
        router.addEventListener(events.ROUTER_START, null as any);
      }).toThrowError(TypeError);
      expect(() => {
        router.addEventListener(events.ROUTER_START, null as any);
      }).toThrowError("Expected callback to be a function");
    });

    it("should throw TypeError for non-function types", () => {
      expect(() => {
        router.addEventListener(events.ROUTER_START, "string" as any);
      }).toThrowError(TypeError);

      expect(() => {
        router.addEventListener(events.ROUTER_START, 123 as any);
      }).toThrowError(TypeError);

      expect(() => {
        router.addEventListener(events.ROUTER_START, {} as any);
      }).toThrowError(TypeError);

      expect(() => {
        router.addEventListener(events.ROUTER_START, [] as any);
      }).toThrowError(TypeError);
    });

    it("should throw Error for invalid event name", () => {
      expect(() => {
        router.addEventListener("INVALID_EVENT" as any, () => {});
      }).toThrowError("Invalid event name");
    });

    it("should validate both parameters", () => {
      expect(() => {
        router.addEventListener("INVALID_EVENT" as any, "not-function" as any);
      }).toThrowError(); // Should throw for invalid event name first
    });
  });

  // 🟡 IMPORTANT: Execution order
  describe("execution order", () => {
    it("should call listeners in registration order", () => {
      const calls: number[] = [];

      router.addEventListener(events.ROUTER_START, () => calls.push(1));
      router.addEventListener(events.ROUTER_START, () => calls.push(2));
      router.addEventListener(events.ROUTER_START, () => calls.push(3));
      router.addEventListener(events.ROUTER_START, () => calls.push(4));

      router.invokeEventListeners(events.ROUTER_START);

      expect(calls).toStrictEqual([1, 2, 3, 4]);
    });

    it("should maintain order with multiple event types", () => {
      const startCalls: number[] = [];
      const stopCalls: number[] = [];

      router.addEventListener(events.ROUTER_START, () => startCalls.push(1));
      router.addEventListener(events.ROUTER_STOP, () => stopCalls.push(1));
      router.addEventListener(events.ROUTER_START, () => startCalls.push(2));
      router.addEventListener(events.ROUTER_STOP, () => stopCalls.push(2));

      router.invokeEventListeners(events.ROUTER_START);
      router.invokeEventListeners(events.ROUTER_STOP);

      expect(startCalls).toStrictEqual([1, 2]);
      expect(stopCalls).toStrictEqual([1, 2]);
    });

    it("should preserve order after unsubscribe in middle", () => {
      const calls: number[] = [];

      router.addEventListener(events.ROUTER_START, () => calls.push(1));
      const unsub2 = router.addEventListener(events.ROUTER_START, () =>
        calls.push(2),
      );

      router.addEventListener(events.ROUTER_START, () => calls.push(3));

      unsub2(); // Remove middle listener

      router.invokeEventListeners(events.ROUTER_START);

      expect(calls).toStrictEqual([1, 3]); // 2 is skipped
    });
  });

  // 🟡 IMPORTANT: Unsubscribe functionality
  describe("unsubscribe function", () => {
    it("should return unsubscribe function", () => {
      const unsub = router.addEventListener(events.ROUTER_START, () => {});

      expect(typeof unsub).toBe("function");
    });

    it("should prevent callback from being called after unsubscribe", () => {
      const cb = vi.fn();
      const unsub = router.addEventListener(events.ROUTER_START, cb);

      unsub();
      router.invokeEventListeners(events.ROUTER_START);

      expect(cb).not.toHaveBeenCalled();
    });

    it("should allow multiple unsubscribe calls safely", () => {
      const cb = vi.fn();
      const unsub = router.addEventListener(events.ROUTER_START, cb);

      expect(() => {
        unsub();
        unsub();
        unsub();
      }).not.toThrowError();
    });

    it("should work with multiple listeners", () => {
      const cb1 = vi.fn();
      const cb2 = vi.fn();
      const cb3 = vi.fn();

      router.addEventListener(events.ROUTER_START, cb1);
      const unsub2 = router.addEventListener(events.ROUTER_START, cb2);

      router.addEventListener(events.ROUTER_START, cb3);

      unsub2(); // Unsubscribe middle one

      router.invokeEventListeners(events.ROUTER_START);

      expect(cb1).toHaveBeenCalled();
      expect(cb2).not.toHaveBeenCalled();
      expect(cb3).toHaveBeenCalled();
    });

    it("should create unique unsubscribe for each registration", () => {
      const cb = vi.fn();

      const unsub1 = router.addEventListener(events.ROUTER_START, cb);

      unsub1();

      router.addEventListener(events.ROUTER_START, cb);

      router.invokeEventListeners(events.ROUTER_START);

      expect(cb).toHaveBeenCalledTimes(1); // Only second registration active
    });
  });

  // 🟢 DESIRABLE: Edge cases
  describe("edge cases", () => {
    it("should handle listener that removes itself during execution", () => {
      const calls: number[] = [];
      let unsub: () => void;

      unsub = router.addEventListener(events.ROUTER_START, () => {
        calls.push(1);
        unsub(); // Remove self
      });

      router.addEventListener(events.ROUTER_START, () => calls.push(2));

      router.invokeEventListeners(events.ROUTER_START);
      router.invokeEventListeners(events.ROUTER_START);

      // First call: both execute
      // Second call: only second executes
      expect(calls).toStrictEqual([1, 2, 2]);
    });

    it("should handle listener that adds more listeners during execution", () => {
      const calls: number[] = [];

      router.addEventListener(events.ROUTER_START, () => {
        calls.push(1);
        // Add listener during execution
        router.addEventListener(events.ROUTER_START, () => calls.push(3));
      });

      router.addEventListener(events.ROUTER_START, () => calls.push(2));

      router.invokeEventListeners(events.ROUTER_START);

      // First invocation: 1, 2 (new listener not called yet - snapshot)
      expect(calls).toStrictEqual([1, 2]);

      router.invokeEventListeners(events.ROUTER_START);

      // Second invocation: 1, 2, 3, 3 (new listener now called, and adds another)
      expect(calls.length).toBeGreaterThan(2);
    });

    it("should handle empty function callbacks", () => {
      const emptyFn = () => {};

      expect(() => {
        router.addEventListener(events.ROUTER_START, emptyFn);
      }).not.toThrowError();

      expect(() => {
        router.invokeEventListeners(events.ROUTER_START);
      }).not.toThrowError();
    });

    it("should work before router.start()", () => {
      router.stop();

      const cb = vi.fn();

      expect(() => {
        router.addEventListener(events.ROUTER_START, cb);
      }).not.toThrowError();

      router.start();
      router.invokeEventListeners(events.ROUTER_START);

      expect(cb).toHaveBeenCalled();
    });
  });
});
