import type { Router } from "@real-router/core/types";

// Each mark is a number of its own, so a refresh can tell whether the mark it
// answered is still the latest when its navigation commits.
const staleByRouter = new WeakMap<Router, Map<string, number>>();
let lastMark = 0;

/**
 * Mark a context namespace as stale on the given router. The next navigation
 * that lands on a route with a registered loader for this namespace runs the
 * loader in the SSR loader plugin's `subscribeLeave` handler and overwrites
 * `state.context.<namespace>`; the flag is cleared when that navigation
 * commits.
 *
 * Idempotent: a namespace is stale or not, however many marks it took.
 * Survives navigations that cannot refresh: routes without an entry,
 * `client-only` mode, mode-only entries, and navigations that are refused or
 * cancelled — before or after their loader ran — all preserve the flag for
 * the next attempt. A mark made after a refresh's loader ran survives that
 * refresh's commit.
 *
 * Returns `void` (fire-and-forget). To force the refresh rather than wait for
 * the application's next navigation, pair it with a same-route reload — see
 * `NavigationOptions.reload` in `@real-router/core`, which owns that spelling
 * and the measurement of what the pre-M2 three-argument form does instead.
 */
export function markStale(router: Router, namespace: string): void {
  let marks = staleByRouter.get(router);

  if (marks === undefined) {
    marks = new Map<string, number>();
    staleByRouter.set(router, marks);
  }

  marks.set(namespace, ++lastMark);
}

/** Plugin-internal: the latest mark of a stale namespace, or `undefined`. */
export function staleMark(
  router: Router,
  namespace: string,
): number | undefined {
  return staleByRouter.get(router)?.get(namespace);
}

/**
 * Plugin-internal: clear the flag if `mark` is still its latest — the refresh
 * that answered `mark` answered no mark made after it.
 */
export function clearStaleMark(
  router: Router,
  namespace: string,
  mark: number,
): void {
  const marks = staleByRouter.get(router);

  if (marks?.get(namespace) === mark) {
    marks.delete(namespace);
  }
}
