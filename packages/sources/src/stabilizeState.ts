import type { State } from "@real-router/core";

/**
 * State-aware stabilization for route snapshots.
 *
 * Compares `path` (canonical name+params), `state.context.url.hash`
 * (URL fragment, #532), and `state.transition.reload` (#605). When all
 * three match (idempotent navigation), returns `prev` (preserving
 * reference) so frameworks can skip re-renders. When any of them flips,
 * returns `next` so consumers subscribing through `useRoute()` see the
 * new state.
 *
 * `transition.reload === true` is the user's explicit signal for a
 * non-idempotent navigation — `router.navigate(name, params, { reload:
 * true })` is the canonical pairing for `invalidate(router, namespace)`
 * and any cache-bust pattern. Bypassing stabilization for reloads makes
 * `useRoute()` consumers see fresh `state.context.<namespace>` values
 * written by the SSR loader plugin's `subscribeLeave` handler.
 *
 * Ignores `meta` (internal: auto-increment id), other `transition` fields
 * (`from`, `segments`, `redirected`), and `state.context.navigation` /
 * `state.context.browser` (transient transition metadata) — they don't
 * affect render identity for idempotent navigations.
 *
 * Accepts `null` for compatibility with `RouterTransitionSnapshot`
 * (toRoute/fromRoute are `State | null`).
 *
 * @internal Not exported from package public API.
 */
export function stabilizeState<T extends State | null | undefined>(
  prev: T,
  next: T,
): T {
  if (prev === next) {
    return prev;
  }
  if (prev?.path !== next?.path) {
    return next;
  }

  // After the path check, both must be the same non-null State (paths
  // matched, prev !== next reference). Read context.url.hash to detect
  // same-path-different-hash navigation (#532) — render-relevant for
  // tab-style UIs that subscribe via useRoute(). Optional chaining keeps
  // the access null-safe without forbidden non-null assertions.
  if (readContextHash(prev) !== readContextHash(next)) {
    return next;
  }

  // Explicit reload navigation (#605) — caller asked to bypass dedupe so
  // observers see fresh `state.context` written by `invalidate()`-driven
  // loader re-runs. The path equality above guarantees both prev and next
  // are either non-null with matching paths or both nullish; only the
  // non-null branch can carry a meaningful `transition.reload`.
  if (readReloadFlag(next)) {
    return next;
  }

  return prev;
}

function readContextHash(state: State | null | undefined): string | undefined {
  const ctx = state?.context as { url?: { hash?: string } } | undefined;

  return ctx?.url?.hash;
}

function readReloadFlag(state: State | null | undefined): boolean {
  return state?.transition.reload === true;
}
