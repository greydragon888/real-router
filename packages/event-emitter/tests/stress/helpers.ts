/**
 * Shared utilities for event-emitter heap-stress tests.
 *
 * Every heap guard follows the same protocol: force GC, snapshot `heapUsed`,
 * run the workload, force GC again, measure the retained delta. The delta is
 * compared against a threshold anchored to a MEASURED healthy baseline (never a
 * round-MB guess) and validated mutationally — see each test file's header for
 * the measured healthy/leak columns and the exact source mutation that trips it.
 *
 * To re-measure during maintenance, temporarily log `delta` (or force the
 * threshold to `0`) and read the printed bytes — then revert the matching
 * cleanup in `EventEmitter.ts` and read the leak column the same way.
 */

export const MB = 1024 * 1024;

const gcGlobal = globalThis as typeof globalThis & { gc?: () => void };

/**
 * Forces two GC passes for a deterministic heap reading. Requires `--expose-gc`
 * (wired via `execArgv` in `vitest.config.stress.mts`).
 */
export function forceGc(): void {
  if (typeof gcGlobal.gc !== "function") {
    throw new TypeError(
      "Heap stress requires --expose-gc (set via execArgv in vitest.config.stress.mts)",
    );
  }

  gcGlobal.gc();
  gcGlobal.gc();
}

/**
 * Measures the heap retained by `work()`: GC → baseline → run → GC → delta.
 *
 * Any warm-up must run BEFORE this call so its lazy/JIT allocations are
 * reclaimed by the initial GC and excluded from the baseline snapshot.
 */
export function measureHeapDelta(work: () => void): number {
  forceGc();
  const baseline = process.memoryUsage().heapUsed;

  work();

  forceGc();

  return process.memoryUsage().heapUsed - baseline;
}
