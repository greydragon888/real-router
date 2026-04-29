import type { State } from "@real-router/core";

/**
 * State-aware stabilization for route snapshots.
 *
 * Compares `path` (canonical name+params) AND `state.context.url.hash`
 * (URL fragment, #532). When both match, returns `prev` (preserving
 * reference) so frameworks can skip re-renders. When hash flips on a
 * same-path navigation (tab-style UI), returns `next` so consumers
 * subscribing through `useRoute()` see the new state.
 *
 * Ignores `meta` (internal: auto-increment id), `transition` (reference
 * data: from, segments, reload), and `state.context.navigation` /
 * `state.context.browser` (transient transition metadata) — they don't
 * affect what is rendered. `state.context.url.hash` is the only context
 * field that participates in render identity, because tab-style UIs
 * subscribe to it directly.
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

  return prev;
}

function readContextHash(state: State | null | undefined): string | undefined {
  const ctx = state?.context as { url?: { hash?: string } } | undefined;

  return ctx?.url?.hash;
}
