import { fc, test } from "@fast-check/vitest";
import { describe, expect, vi } from "vitest";

import { BaseSource } from "../../src/BaseSource.js";

// Pure-function PBT — no router setup, so 1000 runs is cheap (~10ms total).
const PURE_RUNS = 1000;

/**
 * Audit §2/§6 HIGH — direct instrumentation of BaseSource subscribe ordering.
 *
 * The existing property tests (`routeSource.properties.ts`, etc.) verify the
 * *post-condition* — after subscribe, the listener observes the latest
 * snapshot. They do NOT directly verify the implementation contract:
 *
 *     subscribe(listener):
 *       1. add listener to #listeners
 *       2. THEN call onFirstSubscribe (if wasFirst)
 *
 * If the order were swapped, a synchronous `updateSnapshot()` inside
 * `onFirstSubscribe` would fire BEFORE the just-added listener was registered,
 * causing the listener to miss the very notification it was added to receive.
 * The Preact RouteView nested-remount path relies on this.
 */
describe("BaseSource — subscribe order (audit §6 HIGH direct instrumentation)", () => {
  test.prop([fc.integer({ min: 1, max: 8 })], { numRuns: PURE_RUNS })(
    "listener added BEFORE onFirstSubscribe — sync updateSnapshot inside the hook reaches the listener",
    (newSnapshot) => {
      const source = new BaseSource<number>(0, {
        onFirstSubscribe: () => {
          // Synchronous update during the very subscribe() that triggers
          // this hook — the just-added listener MUST observe it.
          source.updateSnapshot(newSnapshot);
        },
      });

      const listener = vi.fn();
      const unsub = source.subscribe(listener);

      expect(listener).toHaveBeenCalledTimes(1);
      expect(source.getSnapshot()).toBe(newSnapshot);

      unsub();
    },
  );

  test.prop([fc.integer({ min: 1, max: 8 })], { numRuns: PURE_RUNS })(
    "onFirstSubscribe fires exactly once across full disconnect → reconnect cycles",
    (cycles) => {
      const onFirstSubscribe = vi.fn();
      const source = new BaseSource<number>(0, { onFirstSubscribe });

      for (let i = 0; i < cycles; i++) {
        const unsub = source.subscribe(() => {});

        unsub();
      }

      expect(onFirstSubscribe).toHaveBeenCalledTimes(cycles);
    },
  );

  test.prop([fc.array(fc.integer(), { minLength: 1, maxLength: 10 })], {
    numRuns: PURE_RUNS,
  })(
    "notify isolates listener exceptions: surviving listeners see every update, errors re-thrown asynchronously",
    async (snapshots) => {
      const source = new BaseSource<number>(0);
      const survivor = vi.fn();

      const rethrown: unknown[] = [];
      const previousListeners = [...process.listeners("uncaughtException")];

      process.removeAllListeners("uncaughtException");
      const captureHandler = (error: unknown): void => {
        rethrown.push(error);
      };

      process.on("uncaughtException", captureHandler);

      try {
        source.subscribe(() => {
          throw new Error("listener boom");
        });
        source.subscribe(survivor);

        for (const value of snapshots) {
          source.updateSnapshot(value);
        }

        // Drain queueMicrotask-scheduled rethrows.
        await Promise.resolve();
        await Promise.resolve();

        // Surviving listener received EVERY update — invariant "after
        // updateSnapshot, all listeners see the new snapshot" holds.
        expect(survivor).toHaveBeenCalledTimes(snapshots.length);
        // Each throwing listener call surfaces exactly one uncaughtException.
        expect(rethrown).toHaveLength(snapshots.length);
      } finally {
        process.removeListener("uncaughtException", captureHandler);
        for (const listener of previousListeners) {
          process.on("uncaughtException", listener);
        }
      }
    },
  );
});
