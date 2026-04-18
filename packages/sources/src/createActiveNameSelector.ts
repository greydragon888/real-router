import { areRoutesRelated } from "@real-router/route-utils";

import type { Router } from "@real-router/core";

export interface ActiveNameSelector {
  /**
   * Subscribes to active-state changes of a specific route name.
   * Listener is called only when `isActive(routeName)` for this name transitions.
   * Returns an unsubscribe function.
   */
  subscribe: (routeName: string, listener: () => void) => () => void;
  /**
   * O(1) active check for the given route name (non-strict by default —
   * matches descendants). Uses the shared underlying router subscription.
   */
  isActive: (routeName: string) => boolean;
  /** No-op on the cached wrapper. */
  destroy: () => void;
}

const selectorCache = new WeakMap<Router, ActiveNameSelector>();

/**
 * Per-router cached selector providing O(1) active-route checks with one
 * shared router subscription for any number of distinct `routeName`
 * consumers.
 *
 * **When to use:** framework `Link` components that need an active boolean
 * without custom `params` / `activeStrict` / `ignoreQueryParams` — e.g. the
 * common navigation-link case. Multiple `<Link>` components with different
 * `routeName` share ONE `router.subscribe` handle instead of creating one
 * per Link (which is what `createActiveRouteSource(router, name)` does — it
 * caches per-name, so N names = N subscriptions).
 *
 * **When NOT to use:** Link needs `activeStrict: true`, custom `routeParams`,
 * or `ignoreQueryParams: false`. Fall back to `createActiveRouteSource` —
 * its cache handles the full argument surface.
 *
 * Based on the `routeSelector` pattern pioneered by `@real-router/solid`'s
 * `RouterProvider` (`createSelector` + `areRoutesRelated`). This helper
 * ports it to framework-agnostic API so Vue / React / Preact / Svelte /
 * Angular Link components can adopt the same fast path.
 *
 * @see Solid reference implementation — `packages/solid/src/RouterProvider.tsx`
 */
export function createActiveNameSelector(router: Router): ActiveNameSelector {
  const cached = selectorCache.get(router);

  if (cached) {
    return cached;
  }

  // listeners per-name — re-evaluated on every router transition
  const listenersByName = new Map<string, Set<() => void>>();
  // cached active state per-name — used to diff before notifying
  const activeByName = new Map<string, boolean>();

  let routerUnsubscribe: (() => void) | null = null;

  const isActiveNonStrict = (routeName: string): boolean => {
    const current = router.getState();

    if (!current) {
      return false;
    }

    return (
      current.name === routeName || current.name.startsWith(`${routeName}.`)
    );
  };

  const connect = (): void => {
    routerUnsubscribe = router.subscribe((next) => {
      for (const [routeName, listeners] of listenersByName) {
        // Cheap pre-filter: if neither new nor previous route is related
        // to this name, its active state cannot have changed.
        const isNewRelated = areRoutesRelated(routeName, next.route.name);
        const isPrevRelated =
          next.previousRoute &&
          areRoutesRelated(routeName, next.previousRoute.name);

        if (!isNewRelated && !isPrevRelated) {
          continue;
        }

        // activeByName always has an entry for names present in listenersByName —
        // subscribe() seeds it, and we only iterate over listenersByName.
        const prevActive = activeByName.get(routeName) === true;
        const nextActive = isActiveNonStrict(routeName);

        if (prevActive === nextActive) {
          continue;
        }

        activeByName.set(routeName, nextActive);
        for (const listener of listeners) {
          listener();
        }
      }
    });
  };

  const disconnect = (): void => {
    const unsub = routerUnsubscribe;

    routerUnsubscribe = null;
    unsub?.();
  };

  const subscribe = (routeName: string, listener: () => void): (() => void) => {
    let listeners = listenersByName.get(routeName);

    if (!listeners) {
      listeners = new Set();
      listenersByName.set(routeName, listeners);
      activeByName.set(routeName, isActiveNonStrict(routeName));
    }

    listeners.add(listener);

    if (!routerUnsubscribe) {
      connect();
    }

    let unsubscribed = false;

    return () => {
      if (unsubscribed) {
        return;
      }

      unsubscribed = true;
      listeners.delete(listener);

      if (listeners.size === 0) {
        listenersByName.delete(routeName);
        activeByName.delete(routeName);
      }

      if (listenersByName.size === 0) {
        disconnect();
      }
    };
  };

  const isActive = (routeName: string): boolean => {
    const cachedActive = activeByName.get(routeName);

    if (cachedActive !== undefined) {
      return cachedActive;
    }

    // Not subscribed — compute on demand.
    return isActiveNonStrict(routeName);
  };

  const selector: ActiveNameSelector = {
    subscribe,
    isActive,
    destroy: noopDestroy,
  };

  selectorCache.set(router, selector);

  return selector;
}

function noopDestroy(): void {
  // Shared cached selector — external destroy() is a no-op.
}
