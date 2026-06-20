import { describe, it, expect } from "vitest";

import { measureHeapDelta, MB } from "./helpers.js";
import { EventEmitter } from "../../src/EventEmitter.js";

/**
 * Per-event-record release guards for dynamic event names (#750).
 *
 * The emitter keeps THREE per-event-name records in internal maps:
 *   - `#callbacks`     — `Map<name, Set<cb>>`  (listeners)
 *   - `#depthMap`      — `Map<name, number>`   (recursion depth, depth-tracking emit)
 *   - `#warnedEvents`  — `Set<name>`           (onListenerWarn "exactly once" latch)
 *
 * Before #750 the only release point was `clearAll()`, so a consumer with UNIQUE
 * event names accumulated one record per name forever — an unbounded heap leak
 * that `listenerCount()` cannot reveal (it returns 0 for an empty-but-retained
 * record). The fix releases each record the moment its name goes idle: `off()`
 * deletes the `Set` and the warn latch when the last listener leaves, and the
 * depth-tracking `emit()` `finally` deletes the depth entry when recursion
 * unwinds to 0.
 *
 * All four guards are anchored to MEASURED deltas (200k unique names,
 * --expose-gc, isolated runs), not round-MB guesses, and validated mutationally
 * (reverting the matching cleanup pushes the delta to the leak column):
 *
 *   | #  | record / path                       | source mutation                | leak    | healthy  |
 *   | -- | ----------------------------------- | ------------------------------ | ------- | -------- |
 *   | S1 | `#callbacks`   (off, size→0)        | revert `#callbacks.delete`     | ~40.6MB | ~0.004MB |
 *   | S2 | `#depthMap`    (emit finally, d=1)  | revert delete-at-0             | ~10.2MB | ~0.010MB |
 *   | S3 | `#warnedEvents`(off, size→0)        | revert `#warnedEvents.delete`  | ~9.6MB  | ~0.005MB |
 *   | S4 | `#depthMap`    (emit finally, d=4)  | revert intermediate decrement  | ~11.6MB | ~0.006MB |
 *
 * THRESHOLD = 2 MB sits ≫ healthy+noise (≥200× the measured healthy delta, well
 * above CI GC jitter) and ≪ every leak (≥4.8× below the smallest) — so each gate
 * trips on its real leak and stays green when the record is released. These are
 * GENUINE retained-memory leaks (the maps hold strong refs), so they are NOT
 * GC-masked: a heap snapshot sees them.
 *
 * S2 and S4 both guard `#depthMap`, but on INDEPENDENT branches of the unwind
 * `finally`: S2 (depth 1) exercises only the delete-at-0 branch; S4 (depth 4)
 * additionally exercises the intermediate `else` decrement that S2 never reaches.
 * Validated: the intermediate-decrement mutation trips S4 (~11.6MB) while S2
 * stays green (~0.001MB) — so S4 catches a regression S2 structurally cannot.
 */

const NAMES = 200_000;
const THRESHOLD = 2 * MB;

const noise = (): void => {};
const noise2 = (): void => {};

describe("event-emitter heap leak for dynamic event names (#750)", () => {
  it("S1: off() releases the empty Set — 200k on/off on unique names stays bounded", () => {
    const emitter = new EventEmitter<Record<string, unknown[]>>();

    // Warm-up: amortize JIT / lazy allocations before the baseline snapshot.
    for (let i = 0; i < 1000; i++) {
      emitter.on(`warm${i}`, noise)();
    }

    const delta = measureHeapDelta(() => {
      for (let i = 0; i < NAMES; i++) {
        const unsubscribe = emitter.on(`ev${i}`, noise);

        unsubscribe();
      }
    });

    // listenerCount() reports 0 whether the record is released or retained —
    // it cannot reveal the leak, only the heap delta can.
    expect(emitter.listenerCount("ev0")).toBe(0);
    expect(delta).toBeLessThan(THRESHOLD);
  });

  it("S2: depth-tracked emit releases the depthMap entry — 200k on/emit/off on unique names stays bounded", () => {
    const emitter = new EventEmitter<Record<string, unknown[]>>({
      limits: { maxListeners: 0, warnListeners: 0, maxEventDepth: 5 },
    });

    for (let i = 0; i < 1000; i++) {
      const unsubscribe = emitter.on(`warm${i}`, noise);

      emitter.emit(`warm${i}`);
      unsubscribe();
    }

    const delta = measureHeapDelta(() => {
      for (let i = 0; i < NAMES; i++) {
        const unsubscribe = emitter.on(`ev${i}`, noise);

        emitter.emit(`ev${i}`);
        unsubscribe();
      }
    });

    expect(emitter.listenerCount("ev0")).toBe(0);
    expect(delta).toBeLessThan(THRESHOLD);
  });

  it("S3: off() releases the #warnedEvents latch — 200k warn-crossing names stay bounded", () => {
    // warnListeners: 1 + a warn callback → the latch (`#warnedEvents`) allocates
    // and a name is latched once a 2nd listener crosses the threshold. Removing
    // the last listener must drop the latch entry, or it leaks one string/name.
    const emitter = new EventEmitter<Record<string, unknown[]>>({
      limits: { maxListeners: 0, warnListeners: 1, maxEventDepth: 0 },
      onListenerWarn: () => {},
    });

    const latchAndDrop = (name: string): void => {
      const a = emitter.on(name, noise);
      // set.size === 1 === warnListeners → latches `name` in #warnedEvents
      const b = emitter.on(name, noise2);

      a();
      // last listener gone → size 0 → off() must delete the latch entry
      b();
    };

    for (let i = 0; i < 1000; i++) {
      latchAndDrop(`warm${i}`);
    }

    const delta = measureHeapDelta(() => {
      for (let i = 0; i < NAMES; i++) {
        latchAndDrop(`ev${i}`);
      }
    });

    expect(emitter.listenerCount("ev0")).toBe(0);
    expect(delta).toBeLessThan(THRESHOLD);
  });

  it("S4: depth-tracked emit releases the depthMap entry under DEEP recursion (depth 4) — 200k names stay bounded", () => {
    const DEPTH = 4;
    const emitter = new EventEmitter<Record<string, unknown[]>>({
      // maxEventDepth 5 > DEPTH 4 → the recursion is legal (no RecursionDepthError)
      limits: { maxListeners: 0, warnListeners: 0, maxEventDepth: DEPTH + 1 },
    });

    // Drive a single event name through `DEPTH` nested emits, then unsubscribe.
    // The unwind `finally` must walk the entry back to 0 and delete it; a broken
    // intermediate decrement leaves a `{name → DEPTH}` record per name.
    const recurseAndDrop = (name: string): void => {
      let level = 0;
      const unsubscribe = emitter.on(name, () => {
        level += 1;

        if (level < DEPTH) {
          emitter.emit(name);
        }
      });

      emitter.emit(name);
      unsubscribe();
    };

    for (let i = 0; i < 1000; i++) {
      recurseAndDrop(`warm${i}`);
    }

    const delta = measureHeapDelta(() => {
      for (let i = 0; i < NAMES; i++) {
        recurseAndDrop(`ev${i}`);
      }
    });

    expect(emitter.listenerCount("ev0")).toBe(0);
    expect(delta).toBeLessThan(THRESHOLD);
  });
});
