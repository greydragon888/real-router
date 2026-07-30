import { vi } from "vitest";

/**
 * Observe the errors this package re-throws asynchronously.
 *
 * ## Why not `process.on("uncaughtException")`
 *
 * The isolation contract is `queueMicrotask(() => { throw error })` — **one
 * schedule per isolated error** (`BaseSource.updateSnapshot`,
 * `createActiveNameSelector`'s per-listener and per-name arms). Capturing the
 * process-level event instead asserts how many `uncaughtException` events the
 * HOST delivers for one throw, which is nobody's contract and is not stable:
 *
 * | environment                       | events for ONE `queueMicrotask` throw |
 * | --------------------------------- | ------------------------------------- |
 * | vitest + Node 24.11.1             | 1                                     |
 * | vitest + Node 24.18.1             | **2**                                 |
 * | bare Node 24.11 / 24.18 / 26.5    | 1                                     |
 *
 * Measured on one tree, one commit, with only the Node binary swapped; probes
 * inside the re-throw sites confirmed our side schedules **once** and runs the
 * callback **once** in every case. So the doubling lives in the harness, not in
 * this package — and a test that counts host deliveries fails for a reason that
 * has nothing to do with the code under test. (It is also conditional: 100
 * isolated errors still arrive 100 times, so the old shape did not even fail
 * uniformly.)
 *
 * Intercepting the schedule instead is both stabler and *stricter*: it pins the
 * count we actually promise (`scheduled()`) and the value we promise to surface
 * (`errors`). A genuine double-schedule — the regression #767 / #1478 exist to
 * catch — still fails the assertion.
 *
 * The interception keeps the callback **asynchronous** so any other
 * `queueMicrotask` user in the same test behaves normally; only the exception is
 * diverted instead of escaping into the harness.
 */
export interface AsyncRethrowCapture {
  /** Errors thrown by the scheduled callbacks, in schedule order. */
  readonly errors: unknown[];
  /** How many times the code under test scheduled a re-throw. */
  scheduled: () => number;
  /** Await the scheduled callbacks (macrotask boundary — drains microtasks). */
  flush: () => Promise<void>;
  /** Restore the real `queueMicrotask`. Call from a `finally`. */
  restore: () => void;
}

export function captureAsyncRethrows(): AsyncRethrowCapture {
  const errors: unknown[] = [];
  const spy = vi
    .spyOn(globalThis, "queueMicrotask")
    .mockImplementation((callback: VoidFunction) => {
      void Promise.resolve().then(() => {
        try {
          callback();
        } catch (error) {
          errors.push(error);
        }
      });
    });

  return {
    errors,
    scheduled: () => spy.mock.calls.length,
    flush: async () => {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      });
    },
    restore: () => {
      spy.mockRestore();
    },
  };
}
