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
 * ⚑ Only a value core BUILT is recorded, and `freezeThrownError` marks it so.
 * An end the application handed in — the reason of a caller's `opts.signal`
 * (#943), a quiet cancel a guard threw — is one it holds apart from any
 * navigation, and may raise again as its own quiet cancel: one `RouterError`
 * thrown from every guard, the reason of a signal it passed to an earlier
 * navigation. `abort-dispatch-authority-2778.test.ts` holds that every
 * `TRANSITION_CANCELLED` core builds passes through `freezeThrownError`.
 *
 * ⚑ An abort site records what the signal holds once aborted — what a request
 * bound to it rejects with. Every raw abort of a navigation's controller
 * records it — `abort-dispatch-authority-2778.test.ts` holds that.
 */
const built = new WeakSet<object>();
const ends = new WeakSet<object>();

export function recordConstruction(error: object): void {
  built.add(error);
}

export function recordNavigationEnd(value: unknown): void {
  // A primitive is never built, so it is never recorded either.
  if (built.has(value as object)) {
    ends.add(value as object);
  }
}

export function isNavigationEnd(value: unknown): boolean {
  return ends.has(value as object);
}
