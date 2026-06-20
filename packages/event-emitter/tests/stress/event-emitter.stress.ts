import { describe, it, expect } from "vitest";

import { EventEmitter } from "../../src/EventEmitter.js";

/**
 * Heap-leak guards for dynamic event names (#750).
 *
 * `off()` and the depth-tracking emit path both keep a per-event-name record in
 * an internal `Map` (`#callbacks`, `#depthMap`). Before the fix the only release
 * point was `clearAll()`, so a consumer with UNIQUE event names accumulated one
 * record per name forever — an unbounded heap leak that `listenerCount()` could
 * not reveal (it returns 0 for an empty-but-retained record).
 *
 * Both thresholds are anchored to MEASURED deltas (200k unique names,
 * --expose-gc, isolated runs), not round-MB guesses:
 *
 *   | scenario           | leak (pre-fix) | healthy (fixed) |
 *   | ------------------ | -------------- | --------------- |
 *   | off() / #callbacks | ~40.6 MB       | ~0.03 MB        |
 *   | emit / #depthMap   | ~10.2 MB       | ~0.03 MB        |
 *
 * THRESHOLD = 2 MB sits ≫ healthy+noise (~40–60× the measured healthy delta,
 * comfortably above CI GC jitter) and ≪ the leak (≥3× below both, 20× for
 * #callbacks / 5× for #depthMap) — so each gate trips on the real leak and stays
 * green when the record is released. This is a GENUINE retained-memory leak (the
 * Map holds strong refs to the records), so it is NOT GC-masked: a heap snapshot
 * sees it. Validated mutationally — reverting either fix pushes the delta to the
 * leak column above.
 */

const MB = 1024 * 1024;
const NAMES = 200_000;
const THRESHOLD = 2 * MB;

const noise = (): void => {};

const gcGlobal = globalThis as typeof globalThis & { gc?: () => void };

function forceGc(): void {
  if (typeof gcGlobal.gc !== "function") {
    throw new TypeError(
      "Heap stress requires --expose-gc (set via execArgv in vitest.config.stress.mts)",
    );
  }

  gcGlobal.gc();
  gcGlobal.gc();
}

describe("event-emitter heap leak for dynamic event names (#750)", () => {
  it("S1: off() releases the empty Set — 200k on/off on unique names stays bounded", () => {
    // eslint-disable-next-line unicorn/prefer-event-target -- custom EventEmitter, not Node.js EventEmitter
    const emitter = new EventEmitter<Record<string, unknown[]>>();

    // Warm-up: amortize JIT / lazy allocations before the baseline snapshot.
    for (let i = 0; i < 1000; i++) {
      emitter.on(`warm${i}`, noise)();
    }

    forceGc();
    const baseline = process.memoryUsage().heapUsed;

    for (let i = 0; i < NAMES; i++) {
      const unsubscribe = emitter.on(`ev${i}`, noise);

      unsubscribe();
    }

    forceGc();
    const delta = process.memoryUsage().heapUsed - baseline;

    // listenerCount() reports 0 whether the record is released or retained —
    // it cannot reveal the leak, only the heap delta can.
    expect(emitter.listenerCount("ev0")).toBe(0);
    expect(delta).toBeLessThan(THRESHOLD);
  });

  it("S2: depth-tracked emit releases the depthMap entry — 200k on/emit/off on unique names stays bounded", () => {
    // eslint-disable-next-line unicorn/prefer-event-target -- custom EventEmitter, not Node.js EventEmitter
    const emitter = new EventEmitter<Record<string, unknown[]>>({
      limits: { maxListeners: 0, warnListeners: 0, maxEventDepth: 5 },
    });

    for (let i = 0; i < 1000; i++) {
      const unsubscribe = emitter.on(`warm${i}`, noise);

      emitter.emit(`warm${i}`);
      unsubscribe();
    }

    forceGc();
    const baseline = process.memoryUsage().heapUsed;

    for (let i = 0; i < NAMES; i++) {
      const unsubscribe = emitter.on(`ev${i}`, noise);

      emitter.emit(`ev${i}`);
      unsubscribe();
    }

    forceGc();
    const delta = process.memoryUsage().heapUsed - baseline;

    expect(emitter.listenerCount("ev0")).toBe(0);
    expect(delta).toBeLessThan(THRESHOLD);
  });
});
