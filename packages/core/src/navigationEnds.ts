// packages/core/src/navigationEnds.ts

/**
 * The values core has handed out as the END of a navigation: what its signal
 * was aborted with, and what its promise rejected with.
 *
 * A guard receives one of them only by waiting on that navigation's work — a
 * request bound to its signal and deduplicated across navigations, or its
 * promise — so `handleGuardError` asks this to tell such a value from the
 * guard's own quiet cancel (#933), which is a value the guard made.
 *
 * ⚑ The signal side records what the SIGNAL holds, read back after the abort:
 * a request rejects with `signal.reason`, so a signal holding a copy of the
 * reason core passed is recognised as well. Every raw abort of a navigation's
 * controller records it — `abort-dispatch-authority-2778.test.ts` holds that.
 */
const ends = new WeakSet<object>();

export function recordNavigationEnd(value: unknown): void {
  // A primitive has no identity to tell it apart by.
  if (typeof value === "object" && value !== null) {
    ends.add(value);
  }
}

export function isNavigationEnd(value: unknown): boolean {
  return ends.has(value as object);
}
