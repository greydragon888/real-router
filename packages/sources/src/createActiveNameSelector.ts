import { areRoutesRelated } from "@real-router/route-utils";

import { noopDestroy } from "./internal/noopDestroy.js";

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

    // Empty string represents the root of the name hierarchy — every named
    // route is its descendant. Without this short-circuit, `current.name`
    // would have to equal `""` or start with `"."` (both impossible for
    // valid route names), breaking symmetry with `createRouteNodeSource("")`
    // which is always-active when a route is current.
    if (routeName === "") {
      return true;
    }

    return (
      current.name === routeName || current.name.startsWith(`${routeName}.`)
    );
  };

  // Diffs and notifies a single route name on a router transition. Extracted
  // from the subscribe callback so the fan-out loop stays a trivial
  // isolate-per-name shell (#1478) — the recompute below (`areRoutesRelated` /
  // `isActiveNonStrict`) runs OUTSIDE the per-listener `try`, so the caller
  // wraps this whole call in a per-name `try` too.
  const notifyName = (
    routeName: string,
    listeners: Set<() => void>,
    newRouteName: string,
    previousRouteName: string | undefined,
  ): void => {
    // Cheap pre-filter: if neither new nor previous route is related to this
    // name, its active state cannot have changed. Empty routeName is the
    // implicit root — every route is its descendant, so the filter would
    // falsely exclude it (`areRoutesRelated` doesn't treat `""` specially).
    // Skip the filter for the root.
    if (routeName !== "") {
      const isNewRelated = areRoutesRelated(routeName, newRouteName);
      const isPrevRelated =
        previousRouteName !== undefined &&
        areRoutesRelated(routeName, previousRouteName);

      if (!isNewRelated && !isPrevRelated) {
        return;
      }
    }

    // activeByName always has an entry for names present in listenersByName —
    // subscribe() seeds it, and we only iterate over listenersByName.
    const prevActive = activeByName.get(routeName) === true;
    const nextActive = isActiveNonStrict(routeName);

    if (prevActive === nextActive) {
      return;
    }

    activeByName.set(routeName, nextActive);
    // Per-listener exception isolation — mirrors `BaseSource.notify`
    // (INVARIANTS "BaseSource 3"). Without it, one throwing Link listener would
    // abort notifications to the remaining listeners of this name (#767).
    // `activeByName.set` already ran above, so the per-name diff is committed
    // before any listener fires. Re-throw asynchronously so the genuine bug
    // still surfaces to global error handlers.
    for (const listener of listeners) {
      try {
        listener();
      } catch (error) {
        queueMicrotask(() => {
          throw error;
        });
      }
    }
  };

  const connect = (): void => {
    routerUnsubscribe = router.subscribe((next) => {
      const newRouteName = next.route.name;
      const previousRouteName = next.previousRoute?.name;

      for (const [routeName, listeners] of listenersByName) {
        // Per-name exception isolation (#1478): `notifyName`'s recompute runs
        // OUTSIDE its per-listener `try`. A throw from it for one name would
        // unwind this shared subscribe callback, skipping every later name's
        // diff/notify and leaving their `activeByName` stale — structurally the
        // #767 failure mode one level up. Safe by construction today (`getState`
        // is a frozen-field read; the rest is pure string ops with no user code
        // in the path), but a future param-aware / predicate recompute could
        // throw here; isolate it the same way, re-throwing asynchronously so a
        // genuine bug still surfaces.
        try {
          notifyName(routeName, listeners, newRouteName, previousRouteName);
        } catch (error) {
          queueMicrotask(() => {
            throw error;
          });
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

      // Stale-generation guard: if this name's registered Set is no longer the
      // one this closure captured, its generation was already fully torn down
      // (all listeners removed → Set deleted) and possibly re-created by a later
      // subscribe. Deleting / disconnecting against the stale Set would delete
      // the LIVE generation's map entry (the empty stale Set trips
      // `size === 0`), orphaning its subscribers. Nothing left for us to clean
      // up here — bail (#1206).
      if (listenersByName.get(routeName) !== listeners) {
        return;
      }

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
