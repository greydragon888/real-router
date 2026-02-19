import { describe, it, expect, vi } from "vitest";

import { EventEmitter } from "../../src/EventEmitter.js";

import type { EventEmitterOptions } from "../../src/types.js";

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- must be `type` not `interface` for Record constraint
type TestEventMap = {
  click: [x: number, y: number];
  hover: [target: string];
  reset: [];
};

/* eslint-disable unicorn/prefer-event-target -- custom EventEmitter, not Node.js EventEmitter */
const createEmitter = (opts?: EventEmitterOptions) =>
  new EventEmitter<TestEventMap>(opts);
/* eslint-enable unicorn/prefer-event-target */

describe("EventEmitter", () => {
  // ===========================================================================
  // on() / off()
  // ===========================================================================

  describe("on() / off()", () => {
    it("should add a listener and call it on emit", () => {
      const emitter = createEmitter();
      const cb = vi.fn();

      emitter.on("click", cb);
      emitter.emit("click", 10, 20);

      expect(cb).toHaveBeenCalledTimes(1);
      expect(cb).toHaveBeenCalledWith(10, 20);
    });

    it("should return an unsubscribe function", () => {
      const emitter = createEmitter();
      const cb = vi.fn();

      const unsub = emitter.on("click", cb);

      unsub();

      emitter.emit("click", 1, 2);

      expect(cb).not.toHaveBeenCalled();
    });

    it("should remove a listener via off()", () => {
      const emitter = createEmitter();
      const cb = vi.fn();

      emitter.on("click", cb);
      emitter.off("click", cb);

      emitter.emit("click", 1, 2);

      expect(cb).not.toHaveBeenCalled();
    });

    it("should handle double unsubscribe safely (idempotent)", () => {
      const emitter = createEmitter();
      const cb = vi.fn();

      const unsub = emitter.on("click", cb);

      unsub();
      unsub(); // second call — no error

      emitter.emit("click", 1, 2);

      expect(cb).not.toHaveBeenCalled();
    });

    it("should allow same callback on different events", () => {
      const emitter = createEmitter();
      const cb = vi.fn();

      emitter.on("click", cb);
      emitter.on("reset", cb);

      emitter.emit("click", 5, 5);
      emitter.emit("reset");

      expect(cb).toHaveBeenCalledTimes(2);
    });

    it("should allow re-registration after unsubscribe", () => {
      const emitter = createEmitter();
      const cb = vi.fn();

      const unsub = emitter.on("hover", cb);

      unsub();

      emitter.on("hover", cb);
      emitter.emit("hover", "div");

      expect(cb).toHaveBeenCalledTimes(1);
      expect(cb).toHaveBeenCalledWith("div");
    });

    it("should off() a callback not in Set without error", () => {
      const emitter = createEmitter();
      const cb = vi.fn();

      // off() on a callback that was never registered — no error
      emitter.off("click", cb);

      expect(emitter.listenerCount("click")).toBe(0);
    });

    it("should off() on an event that has no Set without error", () => {
      const emitter = createEmitter();

      // off() on an event that was never used — no error
      emitter.off("hover", vi.fn());

      expect(emitter.listenerCount("hover")).toBe(0);
    });
  });

  // ===========================================================================
  // emit()
  // ===========================================================================

  describe("emit()", () => {
    it("should forward correct args to listener", () => {
      const emitter = createEmitter();
      const cb = vi.fn();

      emitter.on("click", cb);
      emitter.emit("click", 42, 99);

      expect(cb).toHaveBeenCalledWith(42, 99);
    });

    it("should call multiple listeners in registration order", () => {
      const emitter = createEmitter();
      const order: number[] = [];

      emitter.on("reset", () => order.push(1));
      emitter.on("reset", () => order.push(2));
      emitter.on("reset", () => order.push(3));

      emitter.emit("reset");

      expect(order).toStrictEqual([1, 2, 3]);
    });

    it("should use snapshot iteration — listener added during emit NOT called", () => {
      const emitter = createEmitter();
      const laterCb = vi.fn();

      emitter.on("reset", () => {
        emitter.on("reset", laterCb);
      });

      emitter.emit("reset");

      expect(laterCb).not.toHaveBeenCalled();
    });

    it("should use snapshot iteration — listener removed during emit still called", () => {
      const emitter = createEmitter();
      const cb = vi.fn();
      let unsub: () => void;

      emitter.on("reset", () => {
        unsub();
      });

      unsub = emitter.on("reset", cb);

      emitter.emit("reset");

      expect(cb).toHaveBeenCalledTimes(1);
    });

    it("should catch per-listener errors and call onListenerError", () => {
      const onListenerError = vi.fn();
      const emitter = createEmitter({ onListenerError });
      const error = new Error("boom");
      const secondCb = vi.fn();

      emitter.on("reset", () => {
        throw error;
      });
      emitter.on("reset", secondCb);

      emitter.emit("reset");

      expect(onListenerError).toHaveBeenCalledWith("reset", error);
      expect(secondCb).toHaveBeenCalledTimes(1);
    });

    it("should catch multiple errors independently", () => {
      const onListenerError = vi.fn();
      const emitter = createEmitter({ onListenerError });

      const error1 = new Error("err1");
      const error2 = new Error("err2");

      emitter.on("reset", () => {
        throw error1;
      });
      emitter.on("reset", () => {
        throw error2;
      });

      emitter.emit("reset");

      expect(onListenerError).toHaveBeenCalledTimes(2);
      expect(onListenerError).toHaveBeenCalledWith("reset", error1);
      expect(onListenerError).toHaveBeenCalledWith("reset", error2);
    });

    it("should be a no-op for empty event (no listeners)", () => {
      const emitter = createEmitter();

      emitter.emit("reset");

      expect(emitter.listenerCount("reset")).toBe(0);
    });

    it("should swallow errors silently when no onListenerError callback", () => {
      const emitter = createEmitter();

      emitter.on("reset", () => {
        throw new Error("boom");
      });

      // Should not throw — error is swallowed
      emitter.emit("reset");

      expect(emitter.listenerCount("reset")).toBe(1);
    });
  });

  // ===========================================================================
  // Duplicate detection
  // ===========================================================================

  describe("duplicate detection", () => {
    it("should throw Error containing 'Duplicate listener'", () => {
      const emitter = createEmitter();
      const cb = vi.fn();

      emitter.on("click", cb);

      expect(() => emitter.on("click", cb)).toThrowError("Duplicate listener");
    });

    it("should include event name in error message", () => {
      const emitter = createEmitter();
      const cb = vi.fn();

      emitter.on("hover", cb);

      expect(() => emitter.on("hover", cb)).toThrowError('"hover"');
    });

    it("should detect arrow function duplicates", () => {
      const emitter = createEmitter();
      const arrow = (_target: string) => {};

      emitter.on("hover", arrow);

      expect(() => emitter.on("hover", arrow)).toThrowError(
        "Duplicate listener",
      );
    });

    it("should allow different callbacks on the same event", () => {
      const emitter = createEmitter();

      emitter.on("click", vi.fn());
      emitter.on("click", vi.fn());

      expect(emitter.listenerCount("click")).toBe(2);
    });
  });

  // ===========================================================================
  // maxListeners
  // ===========================================================================

  describe("maxListeners", () => {
    it("should enforce limit and throw Error containing 'Listener limit'", () => {
      const emitter = createEmitter({
        limits: { maxListeners: 2, warnListeners: 0, maxEventDepth: 0 },
      });

      emitter.on("click", vi.fn());
      emitter.on("click", vi.fn());

      expect(() => emitter.on("click", vi.fn())).toThrowError("Listener limit");
    });

    it("should include limit number in error message", () => {
      const emitter = createEmitter({
        limits: { maxListeners: 1, warnListeners: 0, maxEventDepth: 0 },
      });

      emitter.on("reset", vi.fn());

      expect(() => emitter.on("reset", vi.fn())).toThrowError("(1)");
    });

    it("should not throw when maxListeners is 0 (unlimited)", () => {
      const emitter = createEmitter({
        limits: { maxListeners: 0, warnListeners: 0, maxEventDepth: 0 },
      });

      for (let i = 0; i < 100; i++) {
        emitter.on("click", vi.fn());
      }

      expect(emitter.listenerCount("click")).toBe(100);
    });

    it("should apply limit per event, not globally", () => {
      const emitter = createEmitter({
        limits: { maxListeners: 1, warnListeners: 0, maxEventDepth: 0 },
      });

      emitter.on("click", vi.fn());
      emitter.on("hover", vi.fn());
      emitter.on("reset", vi.fn());

      expect(emitter.listenerCount("click")).toBe(1);
      expect(emitter.listenerCount("hover")).toBe(1);
      expect(emitter.listenerCount("reset")).toBe(1);
    });
  });

  // ===========================================================================
  // warnListeners
  // ===========================================================================

  describe("warnListeners", () => {
    it("should call onListenerWarn at threshold", () => {
      const onListenerWarn = vi.fn();
      const emitter = createEmitter({
        limits: { maxListeners: 0, warnListeners: 2, maxEventDepth: 0 },
        onListenerWarn,
      });

      emitter.on("click", vi.fn());

      expect(onListenerWarn).not.toHaveBeenCalled();

      emitter.on("click", vi.fn());

      expect(onListenerWarn).not.toHaveBeenCalled();

      // 3rd listener — at threshold (size === warnListeners)
      emitter.on("click", vi.fn());

      expect(onListenerWarn).toHaveBeenCalledTimes(1);
      expect(onListenerWarn).toHaveBeenCalledWith("click", 2);
    });

    it("should not warn when warnListeners is 0", () => {
      const onListenerWarn = vi.fn();
      const emitter = createEmitter({
        limits: { maxListeners: 0, warnListeners: 0, maxEventDepth: 0 },
        onListenerWarn,
      });

      for (let i = 0; i < 10; i++) {
        emitter.on("click", vi.fn());
      }

      expect(onListenerWarn).not.toHaveBeenCalled();
    });

    it("should not throw (only warn)", () => {
      const onListenerWarn = vi.fn();
      const emitter = createEmitter({
        limits: { maxListeners: 0, warnListeners: 1, maxEventDepth: 0 },
        onListenerWarn,
      });

      emitter.on("click", vi.fn());
      emitter.on("click", vi.fn()); // triggers warn but does not throw

      expect(onListenerWarn).toHaveBeenCalledTimes(1);
      expect(emitter.listenerCount("click")).toBe(2);
    });

    it("should not error when no onListenerWarn callback provided", () => {
      const emitter = createEmitter({
        limits: { maxListeners: 0, warnListeners: 1, maxEventDepth: 0 },
        // no onListenerWarn
      });

      emitter.on("click", vi.fn());

      // 2nd listener passes threshold — should not error
      emitter.on("click", vi.fn());

      expect(emitter.listenerCount("click")).toBe(2);
    });
  });

  // ===========================================================================
  // maxEventDepth
  // ===========================================================================

  describe("maxEventDepth", () => {
    it("should throw Error containing 'Maximum recursion depth' on recursive emit", () => {
      const emitter = createEmitter({
        limits: { maxListeners: 0, warnListeners: 0, maxEventDepth: 1 },
      });

      emitter.on("reset", () => {
        emitter.emit("reset"); // recursive
      });

      expect(() => {
        emitter.emit("reset");
      }).toThrowError("Maximum recursion depth");
    });

    it("should include depth number in error message", () => {
      const emitter = createEmitter({
        limits: { maxListeners: 0, warnListeners: 0, maxEventDepth: 3 },
      });

      emitter.on("reset", () => {
        emitter.emit("reset");
      });

      expect(() => {
        emitter.emit("reset");
      }).toThrowError("(3)");
    });

    it("should not check depth when maxEventDepth is 0 (unlimited)", () => {
      const emitter = createEmitter({
        limits: { maxListeners: 0, warnListeners: 0, maxEventDepth: 0 },
      });

      let count = 0;

      emitter.on("reset", () => {
        count++;
        if (count < 5) {
          emitter.emit("reset");
        }
      });

      emitter.emit("reset");

      expect(count).toBe(5);
    });

    it("should track depth per event, not globally", () => {
      const emitter = createEmitter({
        limits: { maxListeners: 0, warnListeners: 0, maxEventDepth: 1 },
      });

      emitter.on("click", (_x, _y) => {
        emitter.emit("hover", "from-click"); // different event — depth 0
      });

      const hoverCb = vi.fn();

      emitter.on("hover", hoverCb);

      // click emits hover — each at depth 0, no recursion error
      emitter.emit("click", 1, 2);

      expect(hoverCb).toHaveBeenCalledWith("from-click");
    });

    it("should decrement depth after emit completes (including after error)", () => {
      const onListenerError = vi.fn();
      const emitter = createEmitter({
        limits: { maxListeners: 0, warnListeners: 0, maxEventDepth: 1 },
        onListenerError,
      });

      emitter.on("reset", () => {
        throw new Error("boom");
      });

      emitter.emit("reset"); // depth goes 0→1→0

      // Should be able to emit again (depth back to 0)
      emitter.emit("reset");

      expect(onListenerError).toHaveBeenCalledTimes(2);
    });
  });

  // ===========================================================================
  // clearAll()
  // ===========================================================================

  describe("clearAll()", () => {
    it("should wipe all listeners", () => {
      const emitter = createEmitter();
      const cb = vi.fn();

      emitter.on("click", cb);
      emitter.on("hover", vi.fn());

      emitter.clearAll();

      emitter.emit("click", 1, 2);

      expect(cb).not.toHaveBeenCalled();
      expect(emitter.listenerCount("click")).toBe(0);
      expect(emitter.listenerCount("hover")).toBe(0);
    });

    it("should reset depth map", () => {
      const emitter = createEmitter({
        limits: { maxListeners: 0, warnListeners: 0, maxEventDepth: 1 },
      });

      let count = 0;

      emitter.on("reset", () => {
        count++;
      });

      emitter.emit("reset");

      emitter.clearAll();

      // Re-register and emit — should work (depth map reset)
      emitter.on("reset", () => {
        count++;
      });

      emitter.emit("reset");

      expect(count).toBe(2);
    });
  });

  // ===========================================================================
  // listenerCount()
  // ===========================================================================

  describe("listenerCount()", () => {
    it("should return correct count", () => {
      const emitter = createEmitter();

      emitter.on("click", vi.fn());
      emitter.on("click", vi.fn());

      expect(emitter.listenerCount("click")).toBe(2);
    });

    it("should return 0 for events with no listeners", () => {
      const emitter = createEmitter();

      expect(emitter.listenerCount("hover")).toBe(0);
    });

    it("should decrement after off/unsubscribe", () => {
      const emitter = createEmitter();
      const cb = vi.fn();

      const unsub = emitter.on("click", cb);

      expect(emitter.listenerCount("click")).toBe(1);

      unsub();

      expect(emitter.listenerCount("click")).toBe(0);
    });
  });

  // ===========================================================================
  // setLimits()
  // ===========================================================================

  describe("setLimits()", () => {
    it("should update limits after construction", () => {
      const emitter = createEmitter();

      emitter.on("click", vi.fn());
      emitter.on("click", vi.fn());

      // Set limit to 2 — 3rd should throw
      emitter.setLimits({
        maxListeners: 2,
        warnListeners: 0,
        maxEventDepth: 0,
      });

      expect(() => emitter.on("click", vi.fn())).toThrowError("Listener limit");
    });

    it("should take effect immediately for maxEventDepth", () => {
      const emitter = createEmitter();

      let count = 0;

      emitter.on("reset", () => {
        count++;
        if (count < 10) {
          emitter.emit("reset");
        }
      });

      emitter.setLimits({
        maxListeners: 0,
        warnListeners: 0,
        maxEventDepth: 2,
      });

      expect(() => {
        emitter.emit("reset");
      }).toThrowError("Maximum recursion depth");
    });
  });

  // ===========================================================================
  // validateCallback()
  // ===========================================================================

  describe("validateCallback()", () => {
    it("should throw TypeError for non-functions", () => {
      expect(() => {
        EventEmitter.validateCallback(null, "test");
      }).toThrowError(TypeError);
      expect(() => {
        EventEmitter.validateCallback(42, "test");
      }).toThrowError(TypeError);
      expect(() => {
        EventEmitter.validateCallback("str", "test");
      }).toThrowError(TypeError);
      expect(() => {
        EventEmitter.validateCallback({}, "test");
      }).toThrowError(TypeError);
    });

    it("should include 'Expected callback to be a function' in message", () => {
      expect(() => {
        EventEmitter.validateCallback(null, "click");
      }).toThrowError("Expected callback to be a function");
    });

    it("should include event name in error message", () => {
      expect(() => {
        EventEmitter.validateCallback(null, "myEvent");
      }).toThrowError("myEvent");
    });

    it("should pass for functions", () => {
      expect(() => {
        EventEmitter.validateCallback(() => {}, "test");
      }).not.toThrowError();
      expect(() => {
        EventEmitter.validateCallback(() => {}, "test");
      }).not.toThrowError();
    });
  });

  // ===========================================================================
  // Constructor options
  // ===========================================================================

  describe("constructor", () => {
    it("should work with no options", () => {
      // eslint-disable-next-line unicorn/prefer-event-target -- custom EventEmitter
      const emitter = new EventEmitter();
      const cb = vi.fn();

      emitter.on("any", cb);
      emitter.emit("any");

      expect(cb).toHaveBeenCalledTimes(1);
    });

    it("should apply initial limits from options", () => {
      const emitter = createEmitter({
        limits: { maxListeners: 1, warnListeners: 0, maxEventDepth: 0 },
      });

      emitter.on("click", vi.fn());

      expect(() => emitter.on("click", vi.fn())).toThrowError("Listener limit");
    });
  });
});
