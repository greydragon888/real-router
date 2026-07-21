import { describe, it, expect } from "vitest";

import { measureHeapDelta, MB } from "./helpers.js";
import { EventEmitter } from "../../../../src/utils/event-emitter/EventEmitter.js";

/**
 * Subscribe/unsubscribe storm on a STABLE event name — bounded working set.
 *
 * The production pattern: UI components mount/unmount and `on()`/`off()` the same
 * router event (`$$success`) thousands of times over a session. Unlike the #750
 * dynamic-name leak, here the event name is permanent — the `#callbacks` record
 * never goes idle, so the only thing that can grow is the listener `Set` itself
 * and the per-`on()` unsubscribe closures it would retain. `off()` must release
 * each evicted listener; a broken `set.delete(cb)` turns steady churn into an
 * unbounded accumulation.
 *
 * A rolling window of WINDOW live listeners is kept: each iteration adds a fresh
 * closure and evicts the oldest. The live count is therefore constant at WINDOW,
 * while ITERATIONS distinct closures pass through. This is checked two ways:
 *   - behaviorally — `listenerCount` stays exactly WINDOW (a no-op `off()` would
 *     let it climb to ITERATIONS);
 *   - by heap — evicted closures must be reclaimed, so the retained delta stays
 *     far below the leak.
 *
 * Threshold anchored to MEASURED healthy vs leak (--expose-gc, isolated) and
 * validated mutationally by reverting `set.delete(cb)` in `off()`:
 *
 *   | scenario                          | source mutation     | leak     | healthy   |
 *   | --------------------------------- | ------------------- | -------- | --------- |
 *   | 200k churn over a 16-listener win | revert `set.delete` | ~23.3MB  | ~0.001MB  |
 *
 * THRESHOLD = 2 MB sits ≥2000× above the measured healthy delta and ~11× below
 * the leak. The mutation also trips the behavioral guard (`listenerCount` climbs
 * to 201000 instead of WINDOW), so the leak is caught two independent ways.
 *
 * Not GC-masked: the leaked closures are held by a strong ref in the live `Set`,
 * so a heap snapshot sees them. (S1 in event-emitter.stress.ts guards the same
 * `set.delete` via dynamic names where the record is released each cycle; this
 * guard pins it on a permanent, continuously-churned name where the record stays
 * hot — the production mount/unmount shape.)
 */

const ITERATIONS = 200_000;
const WINDOW = 16;
const THRESHOLD = 2 * MB;

describe("event-emitter subscription churn on a stable name", () => {
  it("keeps a bounded working set across 200k on/off cycles over a 16-listener window", () => {
    const emitter = new EventEmitter<Record<string, unknown[]>>();

    // Each listener captures its index so V8 cannot fold them into one shared
    // closure — ITERATIONS genuinely-distinct objects flow through the window.
    // Each closure captures `i` (a distinct context per listener, so V8 cannot
    // fold them into one shared instance) plus the shared `firings` counter.
    // Listeners are never invoked here — the test only churns on/off — so
    // `firings` stays 0, asserted at the end to keep the capture observably live.
    let firings = 0;
    const makeListener = (i: number): (() => void) => {
      return () => {
        firings += i;
      };
    };

    // Rolling window of live callbacks; the test holds refs ONLY to the WINDOW
    // currently-live ones, so anything `off()` removes becomes unreachable and
    // must be reclaimed.
    const live: (() => void)[] = [];

    const churn = (count: number, base: number): void => {
      for (let i = 0; i < count; i++) {
        const cb = makeListener(base + i);

        emitter.on("evt", cb);
        live.push(cb);

        if (live.length > WINDOW) {
          const evicted = live.shift();

          if (evicted) {
            emitter.off("evt", evicted);
          }
        }
      }
    };

    // Warm-up amortizes JIT + the steady-state window before the baseline.
    churn(1000, 0);

    const delta = measureHeapDelta(() => {
      churn(ITERATIONS, 1_000_000);
    });

    // A no-op off() would let the live set climb toward ITERATIONS instead of
    // holding at WINDOW — this catches the leak behaviorally, the delta by heap.
    expect(emitter.listenerCount("evt")).toBe(WINDOW);
    expect(delta).toBeLessThan(THRESHOLD);
    // Listeners were only registered/removed, never emitted — capture stayed live.
    expect(firings).toBe(0);

    // Drain the window; the permanent record is released only now (size → 0).
    for (const cb of live) {
      emitter.off("evt", cb);
    }

    expect(emitter.listenerCount("evt")).toBe(0);
  });
});
