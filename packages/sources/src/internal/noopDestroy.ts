/**
 * @internal
 *
 * Shared no-op `destroy()` for cached `RouterSource` wrappers.
 *
 * Cached factories (`getTransitionSource`, `getErrorSource`, `createDismissableError`,
 * `createActiveNameSelector`, cache hit in `createRouteNodeSource`,
 * `createActiveRouteSource`) return a wrapper whose `destroy()` is a no-op —
 * the underlying source is shared across all consumers and lives as long as
 * the router (WeakMap entry releases on router GC).
 *
 * One module-level function shared by every cached factory keeps the wrapper
 * shape (`{ subscribe, getSnapshot, destroy: noopDestroy }`) byte-stable and
 * eliminates the previous six copies. (Bundlers inline a stand-alone arrow
 * just as readily, so the cost is purely on the maintenance side.)
 */
export function noopDestroy(): void {
  // Shared cached source — external destroy() is a no-op.
}
