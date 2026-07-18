import { describe, it, expect } from "vitest";

import { measureHeapDelta, MB } from "./helpers.js";
import { EventEmitter } from "../../../../src/foundation/event-emitter/EventEmitter.js";

/**
 * Per-event-name record release guards for dynamic event names (#750, #1033).
 *
 * The emitter keeps THREE per-event-name records in internal containers:
 *   - `#callbacks`     — `Map<name, Set<cb>>`  (listeners)
 *   - `#warnedEvents`  — `Set<name>`           (onListenerWarn "exactly once" latch)
 *   - `#dispatching`   — `Set<name>`           (names currently being dispatched —
 *                                               the re-entrancy coalesce guard, #1033)
 *
 * A consumer with UNIQUE event names must not accumulate one record per name
 * forever — an unbounded heap leak that `listenerCount()` cannot reveal (it
 * returns 0 for an empty-but-retained record). Each record is released the moment
 * its name goes idle:
 *   - `off()` deletes the listener `Set` and the warn latch when the last listener
 *     leaves (#750).
 *   - `emit()` adds the name to `#dispatching` for the duration of the dispatch and
 *     releases it in a `finally`, so an in-flight entry never outlives its emit
 *     (#1033). There is no depth bound and no recursion: a re-entrant emit of an
 *     already-in-flight name is coalesced to a no-op, so the entry's lifetime is
 *     exactly one (non-re-entrant) dispatch.
 *
 * All three guards are anchored to MEASURED deltas (200k unique names,
 * --expose-gc, isolated runs), not round-MB guesses, and validated mutationally
 * (reverting the matching cleanup pushes the delta to the leak column):
 *
 *   | #  | record / path                       | source mutation                | leak    | healthy  |
 *   | -- | ----------------------------------- | ------------------------------ | ------- | -------- |
 *   | S1 | `#callbacks`    (off, size→0)       | revert `#callbacks.delete`     | ~40.6MB | ~0.004MB |
 *   | S2 | `#dispatching`  (emit finally)      | revert `#dispatching.delete`   | ~9.6MB  | ~0.006MB |
 *   | S3 | `#warnedEvents` (off, size→0)       | revert `#warnedEvents.delete`  | ~9.6MB  | ~0.005MB |
 *
 * THRESHOLD = 2 MB sits ≫ healthy+noise (≥200× the measured healthy delta, well
 * above CI GC jitter) and ≪ every leak (≥4.8× below the smallest) — so each gate
 * trips on its real leak and stays green when the record is released. These are
 * GENUINE retained-memory leaks (the containers hold strong refs), so they are
 * NOT GC-masked: a heap snapshot sees them.
 *
 * S2's leak column (~9.6MB, broken emit `finally`) was measured against a faithful
 * reimplementation of the on/emit/off path, since the production `finally` cannot
 * be reverted from a test; the retained object is identical (a `Set` holding the
 * same 200k name strings), so the figure transfers directly.
 */

const NAMES = 200_000;
const THRESHOLD = 2 * MB;

const noise = (): void => {};
const noise2 = (): void => {};

describe("event-emitter heap leak for dynamic event names (#750, #1033)", () => {
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

  it("S2: emit() releases the in-flight (#dispatching) entry — 200k on/emit/off on unique names stays bounded", () => {
    // emit() adds the name to #dispatching, then its `finally` deletes it. With a
    // unique name per emit, a broken `finally` retains one name string per emit —
    // an unbounded leak invisible to listenerCount() (off() empties #callbacks,
    // but #dispatching is untouched by off()).
    const emitter = new EventEmitter<Record<string, unknown[]>>({
      limits: { maxListeners: 0, warnListeners: 0 },
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
      limits: { maxListeners: 0, warnListeners: 1 },
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

  it("S4: on() retains no orphan record when a rejection throws — 200k FAILED on() on unique names stays bounded (#1167)", () => {
    // maxListeners < 0 makes the limit check `size >= maxListeners` true at
    // size 0, so the FIRST on() of every new name throws. A rejected registration
    // must be atomic — it must NOT leave a record behind. Pre-#1358(b) `on()`
    // created + stored the Set (#getCallbackSet) BEFORE the checks, so each throw
    // stranded an empty Set: an unbounded heap-only leak (listenerCount stays 0).
    // Anchored to THRESHOLD and mutation-validated like S1–S3 (reverting the fix —
    // create-before-check — pushes the delta into the leak column).
    const emitter = new EventEmitter<Record<string, unknown[]>>({
      limits: { maxListeners: -1, warnListeners: 0 },
    });

    // Warm-up: amortize JIT / lazy allocations before the baseline snapshot.
    for (let i = 0; i < 1000; i++) {
      try {
        emitter.on(`warm${i}`, noise);
      } catch {
        // expected — a negative limit rejects every registration
      }
    }

    const delta = measureHeapDelta(() => {
      for (let i = 0; i < NAMES; i++) {
        try {
          emitter.on(`ev${i}`, noise);
        } catch {
          // expected
        }
      }
    });

    // listenerCount() reports 0 whether the orphan record is retained or not —
    // only the heap delta can reveal the leak.
    expect(emitter.listenerCount("ev0")).toBe(0);
    expect(delta).toBeLessThan(THRESHOLD);
  });
});
