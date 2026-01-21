// packages/react/modules/utils.ts

import type { Params, Router, State } from "@real-router/core";
import type { MouseEvent } from "react";

/**
 * Cache for shouldUpdateNode functions to avoid recreating them
 */
export const shouldUpdateCache = new WeakMap<
  Router,
  Map<string, (toState: State, fromState?: State) => boolean>
>();

/**
 * Get cached shouldUpdateNode function for a router and nodeName
 */
export function getCachedShouldUpdate(
  router: Router,
  nodeName: string,
): (toState: State, fromState?: State) => boolean {
  let cache = shouldUpdateCache.get(router);

  if (!cache) {
    cache = new Map();
    shouldUpdateCache.set(router, cache);
  }

  let fn = cache.get(nodeName);

  if (!fn) {
    fn = router.shouldUpdateNode(nodeName);

    const originalFn = fn;

    fn = (toState: State, fromState?: State) => originalFn(toState, fromState);

    cache.set(nodeName, fn);
  }

  return fn;
}

/**
 * Check if navigation should be handled by router
 */
export function shouldNavigate(evt: MouseEvent): boolean {
  return (
    evt.button === 0 && // left click
    !evt.metaKey &&
    !evt.altKey &&
    !evt.ctrlKey &&
    !evt.shiftKey
  );
}

/**
 * Create cache key for route active check
 */
export function createActiveCheckKey(
  routeName: string,
  routeParams: Params,
  activeStrict: boolean,
  ignoreQueryParams: boolean,
): string {
  return JSON.stringify({
    routeName,
    routeParams,
    activeStrict,
    ignoreQueryParams,
  });
}
