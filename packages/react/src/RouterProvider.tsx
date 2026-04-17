import { getNavigator } from "@real-router/core";
import { createRouteSource } from "@real-router/sources";
import { useEffect, useMemo, useSyncExternalStore } from "react";

import { NavigatorContext, RouteContext, RouterContext } from "./context";
import { createRouteAnnouncer } from "./dom-utils/index.js";

import type { Router } from "@real-router/core";
import type { FC, ReactNode } from "react";

export interface RouteProviderProps {
  router: Router;
  children: ReactNode;
  announceNavigation?: boolean;
}

export const RouterProvider: FC<RouteProviderProps> = ({
  router,
  children,
  announceNavigation,
}) => {
  useEffect(() => {
    if (!announceNavigation) {
      return;
    }

    const announcer = createRouteAnnouncer(router);

    return () => {
      announcer.destroy();
    };
  }, [announceNavigation, router]);

  const navigator = useMemo(() => getNavigator(router), [router]);

  // useSyncExternalStore manages the router subscription lifecycle:
  // subscribe connects to router on first listener, unsubscribes on last.
  // This is Strict Mode safe — no useEffect cleanup needed.
  const store = useMemo(() => createRouteSource(router), [router]);
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
