import { getNavigator } from "@real-router/core";
import { createRouteSource } from "@real-router/sources";
import { useMemo } from "preact/hooks";

import { NavigatorContext, RouteContext, RouterContext } from "./context";
import { useSyncExternalStore } from "./useSyncExternalStore";

import type { Router } from "@real-router/core";
import type { FunctionComponent, ComponentChildren } from "preact";

export interface RouteProviderProps {
  router: Router;
  children: ComponentChildren;
}

export const RouterProvider: FunctionComponent<RouteProviderProps> = ({
  router,
  children,
}) => {
  const navigator = useMemo(() => getNavigator(router), [router]);

  // useSyncExternalStore manages the router subscription lifecycle:
  // subscribe connects to router on first listener, unsubscribes on last.
  const store = useMemo(() => createRouteSource(router), [router]);
  const { route, previousRoute } = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot, // SSR: router returns same state on server and client
  );

  const routeContextValue = useMemo(
    () => ({ navigator, route, previousRoute }),
    [navigator, route, previousRoute],
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
