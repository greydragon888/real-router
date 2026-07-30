import type { Router } from "@real-router/core/types";

const staleByRouter = new WeakMap<Router, Set<string>>();

/**
 * Mark a context namespace as stale on the given router. The next navigation
 * that lands on a route with a registered loader for this namespace consumes
 * the flag in the SSR loader plugin's `subscribeLeave` handler — runs the
 * loader, overwrites `state.context.<namespace>`, and clears the flag.
 *
 * Idempotent (Set-deduplicated). Survives navigations that cannot refresh:
 * routes without an entry, `client-only` mode, mode-only entries, and
 * cancelled navigations all preserve the flag for the next attempt. The
 * flag is cleared only after the loader successfully runs and writes data.
 *
 * Returns `void` (fire-and-forget). For an explicit synchronous round-trip,
 * compose with the existing core API:
 * ```ts
 * markStale(router, "data");
 * // Options at slot 4 (RFC-4 M2 / #1548) — slot 3 is the query channel, so
 * // the pre-M2 spelling lands `{ reload: true }` in `search` and rebuilds the
 * // URL without the page's own query.
 * await router.navigate(state.name, state.params, state.search, {
 *   reload: true,
 * });
 * ```
 */
export function markStale(router: Router, namespace: string): void {
  let set = staleByRouter.get(router);

  if (set === undefined) {
    set = new Set<string>();
    staleByRouter.set(router, set);
  }

  set.add(namespace);
}

/** Plugin-internal: peek without consuming. */
export function isStale(router: Router, namespace: string): boolean {
  return staleByRouter.get(router)?.has(namespace) ?? false;
}

/** Plugin-internal: clear the flag (no-op if not set). */
export function clearStale(router: Router, namespace: string): void {
  staleByRouter.get(router)?.delete(namespace);
}
