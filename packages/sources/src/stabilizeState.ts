import type { State } from "@real-router/core";

/**
 * State-aware stabilization for route snapshots.
 *
 * Compares `path` — the canonical representation of rendering-relevant
 * State fields (name + params). When path matches, returns `prev`
 * (preserving reference), enabling frameworks to skip re-renders.
 *
 * Ignores `meta` (internal: auto-increment id) and `transition`
 * (reference data: from, segments, reload) — they don't affect
 * what is rendered.
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

  return prev;
}
