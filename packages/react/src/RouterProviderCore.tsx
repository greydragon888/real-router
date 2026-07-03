import { getNavigator } from "@real-router/core";
import { createRouteSource, primeErrorSource } from "@real-router/sources";
import { useEffect, useMemo, useSyncExternalStore } from "react";

import { NavigatorContext, RouteContext, RouterContext } from "./context";

import type { Router } from "@real-router/core";
import type { FC, ReactNode } from "react";

export interface RouterProviderCoreProps {
  router: Router;
  children: ReactNode;
}

/**
 * DOM-free provider core: router / route / navigator contexts plus the
 * `useSyncExternalStore` subscription wiring, with **no** dom-utils dependency.
 *
 * Split out of `RouterProvider` (#800) so the terminal `/ink` entry can compose
 * only this: `InkRouterProvider` renders `RouterProviderCore` directly, keeping
 * the scroll-spy / view-transitions / announcer / scroll-restore factories — all
 * structurally unreachable in a terminal — out of the chunk reachable from
 * `dist/esm/ink.mjs`. The DOM-aware `RouterProvider` wraps this core and layers
 * the opt-in DOM-feature effects on top.
 */
export const RouterProviderCore: FC<RouterProviderCoreProps> = ({
  router,
  children,
}) => {
  const navigator = useMemo(() => getNavigator(router), [router]);

  // useSyncExternalStore manages the router subscription lifecycle:
  // subscribe connects to router on first listener, unsubscribes on last.
  // This is Strict Mode safe — no useEffect cleanup needed.
  //
  // Caveat (#765): that same first-listener/last-listener contract opens a
  // stale window if THIS Provider is mounted under a React <Activity> /
  // keepAlive boundary — hiding detaches the subscription, a navigation while
  // hidden is missed, and re-show replays createRouteSource's stale snapshot
  // (createRouteSource does not reconcile on re-subscribe). Keep RouterProvider
  // ABOVE any Activity boundary — see the "Keep RouterProvider above any
  // <Activity> / keepAlive boundary" gotcha in CLAUDE.md.
  const store = useMemo(() => createRouteSource(router), [router]);

  // #778 P2: eagerly create the per-router error source so a navigation error
  // that fires BEFORE a RouterErrorBoundary mounts (a lazy app shell, a failed
  // boot navigation) is still captured. The boundary's createDismissableError
  // reuses this cached source and catches up (#765); without it the error source
  // is created lazily on boundary mount — after the error — and never sees it.
  useEffect(() => {
    primeErrorSource(router);
  }, [router]);
  // Use snapshot reference directly. createRouteSource via stabilizeState
  // returns the SAME snapshot reference when route.path is unchanged, so
  // useMemo below sees stable deps for idempotent navigations and
  // RouteContext consumers do not re-render.
  const snapshot = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot, // SSR: router returns same state on server and client
  );

  const routeContextValue = useMemo(
    () => ({
      navigator,
      route: snapshot.route,
      previousRoute: snapshot.previousRoute,
    }),
    [navigator, snapshot],
  );

  return (
    <RouterContext.Provider value={router}>
      <NavigatorContext.Provider value={navigator}>
        <RouteContext.Provider value={routeContextValue}>
          {children}
        </RouteContext.Provider>
      </NavigatorContext.Provider>
    </RouterContext.Provider>
  );
};
