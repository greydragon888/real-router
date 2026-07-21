import { describe, it, expect, vi } from "vitest";

import { EventEmitter } from "../../../../src/utils/event-emitter/EventEmitter.js";

import type { EventEmitterOptions } from "../../../../src/utils/event-emitter/types.js";

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- must be `type` not `interface` for Record constraint
type TestEventMap = {
  click: [x: number, y: number];
  hover: [target: string];
  reset: [];
  submit: [action: string, data: object, validate: boolean];
  complex: [a: string, b: string, c: string, d: string];
};

const createEmitter = (opts?: EventEmitterOptions) =>
  new EventEmitter<TestEventMap>(opts);

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

    it("should call listener with 3 args (switch case 3)", () => {
      const emitter = createEmitter();
      const cb = vi.fn();

      emitter.on("submit", cb);
      emitter.emit("submit", "save", { id: 1 }, true);

      expect(cb).toHaveBeenCalledWith("save", { id: 1 }, true);
    });

    it("should call listener with 4+ args (switch default)", () => {
      const emitter = createEmitter();
      const cb = vi.fn();

      emitter.on("complex", cb);
      emitter.emit("complex", "a", "b", "c", "d");

      expect(cb).toHaveBeenCalledWith("a", "b", "c", "d");
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

    it("should keep the remaining listeners when one of several is removed (cleanup gated on size === 0)", () => {
      const emitter = createEmitter();
      const cb1 = vi.fn();
      const cb2 = vi.fn();

      emitter.on("click", cb1);
      emitter.on("click", cb2);

      // off() one of two — the per-event Set must NOT be released (size is 1, not 0),
      // so cb2 stays registered. Guards the `set.size === 0` cleanup condition: a
      // `true`/`!== 0` mutant would drop the whole Set here and lose cb2.
      emitter.off("click", cb1);

      expect(emitter.listenerCount("click")).toBe(1);

      emitter.emit("click", 1, 2);

      expect(cb1).not.toHaveBeenCalled();
      expect(cb2).toHaveBeenCalledWith(1, 2);
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

    it("routes an async (rejecting) listener's rejection to onListenerError (#1412)", async () => {
      const onListenerError = vi.fn();
      const emitter = createEmitter({ onListenerError });
      const error = new Error("async boom");
      const secondCb = vi.fn();

      // A listener typed `=> void` that returns a rejecting Promise at runtime
      // (async hook / any-cast misuse). Pre-fix the emitter catches only SYNC
      // throws, so this rejection leaks as an unhandledRejection instead of
      // routing to the sink.
      // eslint-disable-next-line @typescript-eslint/no-misused-promises -- deliberately model an async (promise-returning) listener misuse (#1412)
      emitter.on("reset", () => Promise.reject(error));
      emitter.on("reset", secondCb);

      emitter.emit("reset");
      await new Promise((resolve) => setTimeout(resolve, 0));

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

    it("releases the in-flight guard even when onListenerError itself throws — abnormal emit exit (#1165)", () => {
      const emitter = createEmitter({
        onListenerError: () => {
          throw new Error("reporter boom"); // the error reporter itself throws
        },
      });

      const boom = (): void => {
        throw new Error("listener boom");
      };

      emitter.on("reset", boom);

      // emit exits abnormally (onListenerError re-throws from the catch), but the
      // `finally` must still release the in-flight guard — otherwise "reset"
      // sticks in #dispatching forever and every future emit is silently
      // coalesced (a permanently-dead event). Green now; the move-mutant (delete
      // out of `finally`) turns this red.
      expect(() => {
        emitter.emit("reset");
      }).toThrow("reporter boom");

      expect(emitter.isDispatching("reset")).toBe(false); // released by finally

      // Not permanently dead — with the failing listener removed, a fresh emit
      // still dispatches (it would be coalesced to a no-op if the guard leaked).
      emitter.off("reset", boom);
      const healthy = vi.fn();

      emitter.on("reset", healthy);
      emitter.emit("reset");

      expect(healthy).toHaveBeenCalledTimes(1);
    });

    it("a throw from onListenerError aborts the remaining snapshot — multi-listener (#1165)", () => {
      const emitter = createEmitter({
        onListenerError: () => {
          throw new Error("reporter boom");
        },
      });

      const first = vi.fn(() => {
        throw new Error("first boom"); // triggers onListenerError, which throws
      });
      const second = vi.fn();

      emitter.on("reset", first);
      emitter.on("reset", second);

      // The reporter's throw propagates out of the snapshot loop before it
      // reaches `second` — an intentional abort, NOT per-listener isolation
      // (which holds only while onListenerError itself does not throw). Pins the
      // otherwise-undocumented behaviour; INVARIANTS carve-out lands in #1166.
      expect(() => {
        emitter.emit("reset");
      }).toThrow("reporter boom");

      expect(first).toHaveBeenCalledTimes(1); // ran, threw → reporter threw
      expect(second).not.toHaveBeenCalled(); // never reached
    });

    it("should call a zero-arg listener with EXACTLY zero arguments (switch case 0)", () => {
      const emitter = createEmitter();
      const cb = vi.fn();

      emitter.on("reset", cb);
      emitter.emit("reset");

      // `reset: []` → argc 0 → switch case 0 calls cb() with no args. A `case 0`
      // fallthrough mutant routes to case 1 → cb(undefined), i.e. arity 1. Assert
      // the exact arity, not just that cb ran.
      expect(cb).toHaveBeenCalledTimes(1);
      expect(cb.mock.calls[0]).toHaveLength(0);
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

      expect(() => emitter.on("click", cb)).toThrow("Duplicate listener");
    });

    it("should include event name in error message", () => {
      const emitter = createEmitter();
      const cb = vi.fn();

      emitter.on("hover", cb);

      expect(() => emitter.on("hover", cb)).toThrow('"hover"');
    });

    it("should detect arrow function duplicates", () => {
      const emitter = createEmitter();
      const arrow = (_target: string) => {};

      emitter.on("hover", arrow);

      expect(() => emitter.on("hover", arrow)).toThrow("Duplicate listener");
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
        limits: { maxListeners: 2, warnListeners: 0 },
      });

      emitter.on("click", vi.fn());
      emitter.on("click", vi.fn());

      expect(() => emitter.on("click", vi.fn())).toThrow("Listener limit");
    });

    it("should include limit number in error message", () => {
      const emitter = createEmitter({
        limits: { maxListeners: 1, warnListeners: 0 },
      });

      emitter.on("reset", vi.fn());

      expect(() => emitter.on("reset", vi.fn())).toThrow("(1)");
    });

    it("should not throw when maxListeners is 0 (unlimited)", () => {
      const emitter = createEmitter({
        limits: { maxListeners: 0, warnListeners: 0 },
      });

      for (let i = 0; i < 100; i++) {
        emitter.on("click", vi.fn());
      }

      expect(emitter.listenerCount("click")).toBe(100);
    });

    it("should apply limit per event, not globally", () => {
      const emitter = createEmitter({
        limits: { maxListeners: 1, warnListeners: 0 },
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
        limits: { maxListeners: 0, warnListeners: 2 },
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
        limits: { maxListeners: 0, warnListeners: 0 },
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
        limits: { maxListeners: 0, warnListeners: 1 },
        onListenerWarn,
      });

      emitter.on("click", vi.fn());
      emitter.on("click", vi.fn()); // triggers warn but does not throw

      expect(onListenerWarn).toHaveBeenCalledTimes(1);
      expect(emitter.listenerCount("click")).toBe(2);
    });

    it("should not error when no onListenerWarn callback provided", () => {
      const emitter = createEmitter({
        limits: { maxListeners: 0, warnListeners: 1 },
        // no onListenerWarn
      });

      emitter.on("click", vi.fn());

      // 2nd listener passes threshold — should not error
      emitter.on("click", vi.fn());

      expect(emitter.listenerCount("click")).toBe(2);
    });

    it("should warn exactly once across off/on churn around the threshold", () => {
      const onListenerWarn = vi.fn();
      const emitter = createEmitter({
        limits: { maxListeners: 0, warnListeners: 2 },
        onListenerWarn,
      });

      emitter.on("click", vi.fn());
      emitter.on("click", vi.fn());
      const unsub = emitter.on("click", vi.fn()); // 3rd — size was 2 → warn fires

      expect(onListenerWarn).toHaveBeenCalledTimes(1);

      unsub(); // back to 2 listeners
      emitter.on("click", vi.fn()); // re-crosses the threshold (size is 2 again)

      // "exactly once" must hold across off/on churn, not only monotonic growth
      expect(onListenerWarn).toHaveBeenCalledTimes(1);
    });

    it("should warn again after clearAll() resets the warn latch", () => {
      const onListenerWarn = vi.fn();
      const emitter = createEmitter({
        limits: { maxListeners: 0, warnListeners: 2 },
        onListenerWarn,
      });

      emitter.on("click", vi.fn());
      emitter.on("click", vi.fn());
      emitter.on("click", vi.fn()); // warn fires once

      expect(onListenerWarn).toHaveBeenCalledTimes(1);

      emitter.clearAll();

      emitter.on("click", vi.fn());
      emitter.on("click", vi.fn());
      emitter.on("click", vi.fn()); // fresh accumulation → warn fires again

      expect(onListenerWarn).toHaveBeenCalledTimes(2);
    });

    it("should warn again after off() removes the last listener (latch released with the Set)", () => {
      const onListenerWarn = vi.fn();
      const emitter = createEmitter({
        limits: { maxListeners: 0, warnListeners: 2 },
        onListenerWarn,
      });

      const u1 = emitter.on("click", vi.fn());
      const u2 = emitter.on("click", vi.fn());
      const u3 = emitter.on("click", vi.fn()); // warn fires once

      expect(onListenerWarn).toHaveBeenCalledTimes(1);

      // Remove every listener — the empty Set (and its warn latch) is released.
      u1();
      u2();
      u3();

      expect(emitter.listenerCount("click")).toBe(0);

      emitter.on("click", vi.fn());
      emitter.on("click", vi.fn());
      emitter.on("click", vi.fn()); // fresh accumulation → warn fires again

      expect(onListenerWarn).toHaveBeenCalledTimes(2);
    });

    it("a throwing onListenerWarn does NOT burn the latch — the next registration still warns (#1168)", () => {
      const warned: string[] = [];
      let throwOnWarn = true;
      const emitter = createEmitter({
        limits: { maxListeners: 0, warnListeners: 1 },
        onListenerWarn: (eventName) => {
          warned.push(eventName);

          if (throwOnWarn) {
            throw new Error("warn hook boom");
          }
        },
      });

      emitter.on("click", vi.fn()); // 1st — size 0, below the warn threshold

      // 2nd registration hits the warn threshold (size 1 === warnListeners); the
      // hook fires and throws, so the registration fails. The latch must NOT be
      // burned by a rejected registration — pre-#1358(b) the latch was set BEFORE
      // the throwing hook ran (#1168), so the next successful (W+1)th registration
      // stayed silent.
      expect(() => emitter.on("click", vi.fn())).toThrow("warn hook boom");
      expect(warned).toStrictEqual(["click"]); // fired once, for the failed attempt

      // Disarm the hook — the NEXT registration must still warn (latch not burnt).
      throwOnWarn = false;
      emitter.on("click", vi.fn()); // succeeds — the failed attempt did not spend the latch

      expect(warned).toStrictEqual(["click", "click"]);
    });
  });

  // ===========================================================================
  // re-entrancy (coalesce)
  // ===========================================================================

  describe("re-entrancy (coalesce)", () => {
    it("coalesces a re-entrant emit of the SAME event — no-op, no throw, no recursion", () => {
      const emitter = createEmitter();

      let calls = 0;

      emitter.on("reset", () => {
        calls += 1;
        emitter.emit("reset"); // re-entrant: coalesced to a no-op
      });

      expect(() => {
        emitter.emit("reset");
      }).not.toThrow();

      // The listener ran once; the nested same-event emit did not re-enter.
      expect(calls).toBe(1);
    });

    it("coalesce is per-event — a DIFFERENT event emitted from a listener still fires", () => {
      const emitter = createEmitter();

      emitter.on("click", (_x, _y) => {
        emitter.emit("hover", "from-click"); // different event — not coalesced
      });

      const hoverCb = vi.fn();

      emitter.on("hover", hoverCb);

      emitter.emit("click", 1, 2);

      expect(hoverCb).toHaveBeenCalledWith("from-click");
    });

    it("releases the in-flight guard after dispatch — the same event emits again (incl. after a listener error)", () => {
      const onListenerError = vi.fn();
      const emitter = createEmitter({ onListenerError });

      emitter.on("reset", () => {
        throw new Error("boom");
      });

      emitter.emit("reset"); // dispatch completes; the finally releases the guard
      emitter.emit("reset"); // not coalesced — a fresh, separate dispatch

      expect(onListenerError).toHaveBeenCalledTimes(2);
    });

    it("deeply re-entrant chain still resolves — each event coalesces independently (no overflow)", () => {
      const emitter = createEmitter();
      const order: string[] = [];

      // click → hover → click: click's re-emit (via hover) is coalesced; hover
      // fires once.
      emitter.on("click", () => {
        order.push("click");
        emitter.emit("hover", "h");
      });
      emitter.on("hover", () => {
        order.push("hover");
        emitter.emit("click", 1, 2); // click is in-flight → coalesced
      });

      expect(() => {
        emitter.emit("click", 1, 2);
      }).not.toThrow();

      expect(order).toStrictEqual(["click", "hover"]);
    });

    it("clearAll() from a listener does NOT lift the in-flight guard — re-entrant same-event emit stays coalesced (depth ≤ 1, #1164)", () => {
      const emitter = createEmitter();
      let depth = 0;
      let maxDepth = 0;

      // A listener that clears everything, re-registers itself, and re-emits
      // the SAME event — all while its own emit frame is still on the stack.
      // The re-emit must be coalesced by the in-flight guard (#1033 depth ≤ 1);
      // if clearAll() lifts that guard (#1164), the re-emit re-enters and depth
      // climbs. The `depth < 5` cap keeps the buggy path bounded (no overflow).
      const handler = (): void => {
        depth += 1;
        maxDepth = Math.max(maxDepth, depth);

        if (depth < 5) {
          emitter.clearAll();
          emitter.on("reset", handler);
          emitter.emit("reset"); // in-flight → must coalesce to a no-op
        }

        depth -= 1;
      };

      emitter.on("reset", handler);
      emitter.emit("reset");

      // clearAll()'s stray `this.#dispatching.clear()` lifts the guard held by
      // the live emit frame, so the re-emit re-enters — reaching depth 5. The
      // guard is owned by active emit frames; clearAll() must not sweep it.
      expect(maxDepth).toBe(1);
    });

    it("isDispatching(event) — true for the in-flight event during dispatch, false otherwise", () => {
      const emitter = createEmitter();
      let duringSelf: boolean | undefined;
      let duringOther: boolean | undefined;

      emitter.on("click", () => {
        duringSelf = emitter.isDispatching("click");
        duringOther = emitter.isDispatching("hover");
      });

      expect(emitter.isDispatching("click")).toBe(false); // not dispatching yet

      emitter.emit("click", 1, 2);

      expect(duringSelf).toBe(true); // in-flight during its own dispatch
      expect(duringOther).toBe(false); // a different, idle event
      expect(emitter.isDispatching("click")).toBe(false); // released after
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

    it("should allow re-registration and emit after clearAll (no lingering dispatch state)", () => {
      const emitter = createEmitter({
        limits: { maxListeners: 0, warnListeners: 0 },
      });

      let count = 0;

      emitter.on("reset", () => {
        count++;
      });

      emitter.emit("reset");

      emitter.clearAll();

      // Re-register and emit — clearAll cleared the listeners, so the fresh
      // registration fires. (There is no depth map; the coalesce guard is
      // owned by the emit frame and self-releases in its finally.)
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
      });

      expect(() => emitter.on("click", vi.fn())).toThrow("Listener limit");
    });

    it("should isolate a throwing listener among several — others still run", () => {
      const onListenerError = vi.fn();
      const second = vi.fn();
      const emitter = createEmitter({ onListenerError });
      const error = new Error("boom");

      emitter.on("reset", () => {
        throw error;
      });
      emitter.on("reset", second);

      emitter.emit("reset");

      expect(onListenerError).toHaveBeenCalledWith("reset", error);
      expect(second).toHaveBeenCalledTimes(1); // isolation — others still run
    });
  });

  // ===========================================================================
  // onListenerError edge cases
  // ===========================================================================

  describe("onListenerError edge cases", () => {
    it("should propagate error when onListenerError callback itself throws", () => {
      const emitter = createEmitter({
        onListenerError: () => {
          throw new Error("error handler boom");
        },
      });

      emitter.on("reset", () => {
        throw new Error("listener boom");
      });

      expect(() => {
        emitter.emit("reset");
      }).toThrow("error handler boom");
    });

    it("should propagate error when onListenerError throws (single listener fast path)", () => {
      const emitter = createEmitter({
        onListenerError: () => {
          throw new Error("error handler boom");
        },
      });

      emitter.on("reset", () => {
        throw new Error("listener boom");
      });

      // Single listener uses the fast path (set.size === 1 → direct call)
      expect(emitter.listenerCount("reset")).toBe(1);
      expect(() => {
        emitter.emit("reset");
      }).toThrow("error handler boom");
    });

    it("should propagate the error when the onListenerError handler itself throws", () => {
      const emitter = createEmitter({
        limits: { maxListeners: 0, warnListeners: 0 },
        onListenerError: () => {
          throw new Error("error handler boom");
        },
      });

      emitter.on("reset", () => {
        throw new Error("listener boom");
      });

      expect(() => {
        emitter.emit("reset");
      }).toThrow("error handler boom");
    });
  });

  // ===========================================================================
  // warnListeners === maxListeners boundary
  // ===========================================================================

  describe("warnListeners === maxListeners boundary", () => {
    it("should not warn when listener count equals maxListeners (at exact limit, no warning)", () => {
      const onListenerWarn = vi.fn();
      const emitter = createEmitter({
        limits: { maxListeners: 3, warnListeners: 3 },
        onListenerWarn,
      });

      emitter.on("click", vi.fn()); // 1st — set.size was 0
      emitter.on("click", vi.fn()); // 2nd — set.size was 1
      emitter.on("click", vi.fn()); // 3rd — set.size was 2, warn fires (size === warnListeners)

      // warn is called when set.size === warnListeners (i.e., when adding the (warnListeners+1)th)
      // With warnListeners = 3, warn fires at 4th add, but maxListeners = 3 will throw at 4th
      // So with limit 3 and warn 3, warn never fires before the limit check
      expect(onListenerWarn).not.toHaveBeenCalled();
    });

    it("should warn at exact warnListeners boundary then throw at maxListeners", () => {
      const onListenerWarn = vi.fn();
      const emitter = createEmitter({
        limits: { maxListeners: 4, warnListeners: 2 },
        onListenerWarn,
      });

      emitter.on("click", vi.fn()); // 1st — size was 0
      emitter.on("click", vi.fn()); // 2nd — size was 1

      expect(onListenerWarn).not.toHaveBeenCalled();

      emitter.on("click", vi.fn()); // 3rd — size was 2 === warnListeners → warn fires

      expect(onListenerWarn).toHaveBeenCalledTimes(1);
      expect(onListenerWarn).toHaveBeenCalledWith("click", 2);

      emitter.on("click", vi.fn()); // 4th — at maxListeners, but set.size was 3 !== warnListeners

      expect(onListenerWarn).toHaveBeenCalledTimes(1); // still only 1 warn

      // 5th — throws
      expect(() => emitter.on("click", vi.fn())).toThrow("Listener limit");
    });

    it("should not warn for a registration that fails the limit (warn === max)", () => {
      const onListenerWarn = vi.fn();
      const emitter = createEmitter({
        limits: { maxListeners: 2, warnListeners: 2 },
        onListenerWarn,
      });

      emitter.on("click", vi.fn()); // 1st
      emitter.on("click", vi.fn()); // 2nd — at the limit

      // 3rd registration throws the limit; warn must not fire for a failed add
      expect(() => emitter.on("click", vi.fn())).toThrow("Listener limit");
      expect(onListenerWarn).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // setLimits() inside listener callback
  // ===========================================================================

  describe("setLimits() inside listener callback", () => {
    it("should allow setLimits() to be called inside a listener callback", () => {
      const emitter = createEmitter();

      emitter.on("reset", () => {
        emitter.setLimits({
          maxListeners: 1,
          warnListeners: 0,
        });
      });

      emitter.emit("reset");

      // After emit, limits are changed — new registration should throw
      expect(() => {
        emitter.on("click", vi.fn());
        emitter.on("click", vi.fn());
      }).toThrow("Listener limit");
    });
  });

  // ===========================================================================
  // clearAll() then re-add listeners up to max
  // ===========================================================================

  describe("clearAll() then re-add listeners", () => {
    it("should allow re-adding listeners up to max after clearAll()", () => {
      const emitter = createEmitter({
        limits: { maxListeners: 2, warnListeners: 0 },
      });

      emitter.on("click", vi.fn());
      emitter.on("click", vi.fn());

      expect(() => emitter.on("click", vi.fn())).toThrow("Listener limit");

      emitter.clearAll();

      // Should be able to add up to max again
      const cb1 = vi.fn();
      const cb2 = vi.fn();

      emitter.on("click", cb1);
      emitter.on("click", cb2);

      expect(emitter.listenerCount("click")).toBe(2);

      emitter.emit("click", 1, 2);

      expect(cb1).toHaveBeenCalledWith(1, 2);
      expect(cb2).toHaveBeenCalledWith(1, 2);

      // 3rd should still throw
      expect(() => emitter.on("click", vi.fn())).toThrow("Listener limit");
    });
  });

  // ===========================================================================
  // validateCallback()
  // ===========================================================================

  describe("validateCallback()", () => {
    it("should throw TypeError for non-functions", () => {
      expect(() => {
        EventEmitter.validateCallback(null, "test");
      }).toThrow(TypeError);
      expect(() => {
        EventEmitter.validateCallback(42, "test");
      }).toThrow(TypeError);
      expect(() => {
        EventEmitter.validateCallback("str", "test");
      }).toThrow(TypeError);
      expect(() => {
        EventEmitter.validateCallback({}, "test");
      }).toThrow(TypeError);
    });

    it("should include 'Expected callback to be a function' in message", () => {
      expect(() => {
        EventEmitter.validateCallback(null, "click");
      }).toThrow("Expected callback to be a function");
    });

    it("should include event name in error message", () => {
      expect(() => {
        EventEmitter.validateCallback(null, "myEvent");
      }).toThrow("myEvent");
    });

    it("should pass for functions", () => {
      expect(() => {
        EventEmitter.validateCallback(() => {}, "test");
      }).not.toThrow();
      expect(() => {
        EventEmitter.validateCallback(() => {}, "test");
      }).not.toThrow();
    });
  });

  // ===========================================================================
  // Constructor options
  // ===========================================================================

  describe("constructor", () => {
    it("should work with no options", () => {
      const emitter = new EventEmitter();
      const cb = vi.fn();

      emitter.on("any", cb);
      emitter.emit("any");

      expect(cb).toHaveBeenCalledTimes(1);
    });

    it("should apply initial limits from options", () => {
      const emitter = createEmitter({
        limits: { maxListeners: 1, warnListeners: 0 },
      });

      emitter.on("click", vi.fn());

      expect(() => emitter.on("click", vi.fn())).toThrow("Listener limit");
    });
  });
});
