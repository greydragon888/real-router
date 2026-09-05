import { markStale } from "./shared-ssr";

import type { Router } from "@real-router/core/types";

/**
 * Mark the `"data"` namespace stale: the next navigation that dispatches leave
 * listeners for a route with a loader entry re-runs the loader and writes
 * `state.context.data` onto the destination state.
 *
 * Returns `void`, and fires no transition of its own — the refresh rides the
 * next navigation the application makes.
 *
 * ⚠ **A navigation already IN FLIGHT absorbs the refresh** when this call lands
 * before that navigation's leave dispatch — from `onTransitionStart`, or from a
 * deactivation guard. From an activation guard onwards it waits for the
 * following navigation instead, and an in-flight `start()` never absorbs it at
 * all: a navigation with no `fromState` dispatches no leave listeners. Both
 * arms are pinned in `rsc-loader.test.ts`, one transition apart.
 *
 * ⚠ **Nothing is cached across states.** `state.context` is rebuilt empty for
 * every navigation, so `state.context.rsc` is simply absent unless that plugin's own
 * `invalidate()` was also called on the same transition — it is not a cached
 * value this call preserves.
 *
 * When the flag survives instead of being consumed, and what a rejecting loader
 * does to the `navigate()` that consumes it, are in this package's
 * `CLAUDE.md` — § `invalidate(router, "data")`.
 *
 * @see `NavigationOptions.reload` in `@real-router/core` for the same-route
 * reload spelling: it owns the slot-4 trap together with the measurement of
 * what the pre-M2 three-argument form does instead.
 */
export function invalidate(router: Router, namespace: "data"): void {
  markStale(router, namespace);
}
