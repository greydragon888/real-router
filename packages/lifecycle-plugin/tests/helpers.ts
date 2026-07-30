import { vi } from "vitest";

/**
 * Observe the errors this plugin re-throws asynchronously.
 *
 * The isolation contract is `queueMicrotask(() => { throw error })` in
 * `src/factory.ts` — **one schedule per isolated hook error** (#798 for a
 * throwing hook body, #1222 for a throwing hook FACTORY). Asserting on
 * `process.on("uncaughtException")` instead counts how many events the HOST
 * delivers for one throw, which is not our contract and is not stable: under
 * vitest a single throw arrives twice on Node 24.18.1 and once on 24.11.1, while
 * bare Node delivers it once on every version. Probes inside the re-throw site
 * confirmed we schedule once and run the callback once in both cases.
 *
 * Intercepting the schedule is stabler *and* stricter — it pins the count we
 * promise (`scheduled()`) and the value we promise to surface (`errors`), so a
 * genuine double-schedule still fails. Full rationale, with the measurement
 * table: `packages/sources/tests/helpers.ts`.
 *
 * The interception keeps the callback asynchronous so any other
 * `queueMicrotask` user behaves normally (core uses none today); only the
 * exception is diverted instead of escaping into the harness.
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
