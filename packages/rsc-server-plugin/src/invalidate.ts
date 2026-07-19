import { markStale } from "./shared-ssr";

import type { Router } from "@real-router/core/types";

/**
 * Mark the `"rsc"` namespace as stale on the given router. The next
 * navigation (including a same-route reload) re-runs the RSC loader for the
 * destination route and overwrites `state.context.rsc` (and the mode marker)
 * via the plugin's `subscribeLeave` listener.
 *
 * Honest fire-and-forget semantics — returns `void`. The flag is consumed in
 * the awaited LEAVE_APPROVE phase of the next navigation, so subscribers see
 * a fresh `ReactNode` when the navigation completes. Behaviour during an
 * in-flight transition: the current transition completes unchanged; the flag
 * is read by the *following* navigation. This keeps the invariant
 * "one transition = one `state.context` snapshot" intact.
 *
 * Composability through the existing core API:
 *
 * ```ts
 * // Fire-and-forget: stale until the user navigates somewhere
 * invalidate(router, "rsc");
 *
 * // Explicit await — pair with a same-route reload
 * invalidate(router, "rsc");
 * await router.navigate(state.name, state.params, { reload: true });
 * ```
 *
 * Surgical alternative to `router.navigate({ reload: true })` for multi-
 * namespace routes: only the `"rsc"` namespace re-runs; a side-by-side
 * `ssr-data-plugin` keeps its cached `state.context.data` on this transition
 * unless its own `invalidate()` was also called.
 *
 * **Failure semantics.** The refresh loader runs in the awaited LEAVE_APPROVE
 * phase with no internal `try/catch`, so a rejecting loader **rejects the
 * consuming `navigate()`** — a navigation that would have succeeded *without*
 * `invalidate`. The stale flag is cleared only *after* a successful write, so a
 * rejection **keeps the flag set**: every following navigation to a loader-bearing
 * route re-runs the loader and fails again until it recovers (degradation
 * escalates from "stale payload" to "cannot navigate"). Catch on the caller side,
 * or make the loader infallible (`catch` → previous payload).
 */
export function invalidate(router: Router, namespace: "rsc"): void {
  markStale(router, namespace);
}
