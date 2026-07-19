import { markStale } from "./shared-ssr";

import type { Router } from "@real-router/core/types";

/**
 * Mark the `"data"` namespace as stale on the given router. The next
 * navigation (including a same-route reload) re-runs the loader for the
 * destination route and overwrites `state.context.data` (and the mode marker)
 * via the plugin's `subscribeLeave` listener.
 *
 * Honest fire-and-forget semantics — returns `void`. The flag is consumed in
 * the awaited LEAVE_APPROVE phase of the next navigation, so subscribers see
 * fresh data when the navigation completes. Behaviour during an in-flight
 * transition: the current transition completes unchanged; the flag is read
 * by the *following* navigation. This keeps the invariant
 * "one transition = one `state.context` snapshot" intact.
 *
 * Composability through the existing core API:
 *
 * ```ts
 * // Fire-and-forget: stale until the user navigates somewhere
 * invalidate(router, "data");
 *
 * // Explicit await — pair with a same-route reload
 * invalidate(router, "data");
 * await router.navigate(state.name, state.params, { reload: true });
 * ```
 *
 * Cheaper than `router.navigate({ reload: true })` alone in two ways:
 * 1. No fake transition fired when the application already has a navigation
 *    in flight — the existing one consumes the flag.
 * 2. Surgical: only the `"data"` namespace re-runs. Companion plugins (e.g.
 *    `rsc-server-plugin`) keep their cached `state.context.rsc` on this same
 *    transition unless their own `invalidate()` was also called.
 *
 * **Failure semantics.** The refresh loader runs in the awaited LEAVE_APPROVE
 * phase with no internal `try/catch`, so a rejecting loader **rejects the
 * consuming `navigate()`** — a navigation that would have succeeded *without*
 * `invalidate`. Peek-then-clear-after-write means a rejection **keeps the flag
 * set**: every following navigation to a loader-bearing route re-runs the loader
 * and fails again until it recovers (degradation escalates from "stale data" to
 * "cannot navigate"). Catch on the caller side, or make the loader infallible
 * (`catch` → previous payload).
 */
export function invalidate(router: Router, namespace: "data"): void {
  markStale(router, namespace);
}
