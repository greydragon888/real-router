import type { Router, SerializedRouterState } from "@real-router/core/types";

/**
 * What an in-flight `hydrateRouter` call deposited, keyed by the router it
 * hydrates (#2361).
 *
 * ⚑ Module-private, and written only through `depositHydrationState`, which
 * the package entry does not export — an application cannot pre-populate the
 * scratchpad to skip a loader outside hydration.
 */
const scratchpad = new WeakMap<Router, SerializedRouterState | null>();

/**
 * The payload the `hydrateRouter` call now starting `router` deposited, or
 * `null` outside one.
 *
 * Read it from a `start` interceptor: `hydrateRouter` deposits before
 * `router.start()` and restores the previous value when that call settles, so
 * a later `start()` reads `null`. SSR loader plugins read it to skip the
 * post-hydration loader run (#596).
 */
export function getHydrationState(
  router: Router,
): SerializedRouterState | null {
  return scratchpad.get(router) ?? null;
}

/**
 * Deposits `state` for `router` and returns what puts the previous value back.
 * `hydrateRouter` calls it in `finally`, so a nested call restores the outer
 * payload instead of clearing it.
 */
export function depositHydrationState(
  router: Router,
  state: SerializedRouterState,
): () => void {
  const previous = getHydrationState(router);

  scratchpad.set(router, state);

  return () => {
    scratchpad.set(router, previous);
  };
}
