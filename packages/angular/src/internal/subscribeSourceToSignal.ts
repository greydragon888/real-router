import type { RouterSource } from "@real-router/sources";

/**
 * Subscribe a `RouterSource<T>` to a write-callback and return a cleanup
 * function. The shape is the per-effect-run pattern that `RealLink`,
 * `RealLinkActive`, and `RouteView` all share inside their constructor
 * `effect(...)` (review-2026-05-16 §8a MEDIUM — identical 8-line block
 * repeated in 3 directives):
 *
 *   1. Read initial snapshot and apply it via `onSnapshot(snap)`.
 *   2. Subscribe — every subsequent emission calls `onSnapshot(snap)` again.
 *   3. Return a cleanup that unsubscribes and destroys the source. For
 *      cached factories from `@real-router/sources` (`createActiveRouteSource`,
 *      `createRouteNodeSource`, `getTransitionSource`, `getErrorSource`,
 *      `createDismissableError`) `destroy()` is a no-op on the shared
 *      wrapper, so this helper is safe to invoke from rapid effect re-runs
 *      under signal-input changes.
 *
 * Callers pass the result to `onCleanup(...)` from Angular's `effect()`.
 *
 * @example
 * ```ts
 * effect((onCleanup) => {
 *   const source = createActiveRouteSource(router, routeName(), params());
 *   onCleanup(
 *     subscribeSourceToSignal(source, (snap) => {
 *       this.isActive.set(snap);
 *       this.updateDom();
 *     }),
 *   );
 * });
 * ```
 */
export function subscribeSourceToSignal<T>(
  source: RouterSource<T>,
  onSnapshot: (snapshot: T) => void,
): () => void {
  onSnapshot(source.getSnapshot());

  const unsub = source.subscribe(() => {
    onSnapshot(source.getSnapshot());
  });

  return () => {
    unsub();
    source.destroy();
  };
}
