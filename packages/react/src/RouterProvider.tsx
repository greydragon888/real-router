// packages/react/modules/RouterProvider.tsx

import { useMemo, useSyncExternalStore } from "react";

import { NavigatorContext, RouteContext, RouterContext } from "./context";

import type { RouteState } from "./types";
import type { Router } from "@real-router/core";
import type { FC, ReactNode } from "react";

export interface RouteProviderProps {
  router: Router;
  children: ReactNode;
}

export const RouterProvider: FC<RouteProviderProps> = ({
  router,
  children,
}) => {
  // Get navigator instance from router
  const navigator = useMemo(() => router.getNavigator(), [router]);

  // Local store state to hold route information
  const store = useMemo(() => {
    let currentState: RouteState = {
      route: router.getState(),
      previousRoute: undefined,
    };

    // This will be called to return the current state snapshot
    const getSnapshot = () => currentState;

    // Subscribe to router updates and notify React when state changes
    const subscribe = (callback: () => void) => {
      const unsubscribe = router.subscribe(({ route, previousRoute }) => {
        currentState = { route, previousRoute };
        callback(); // Notify React to trigger re-render
      });

      // Note: router.subscribe() always returns a function, no need to check
      return unsubscribe;
    };

    return { getSnapshot, subscribe };
  }, [router]);

  // Using useSyncExternalStore to manage subscription and state updates
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot);

  // Memoize RouteContext value to prevent unnecessary re-renders
  const routeContextValue = useMemo(
    () => ({ navigator, ...state }),
    [navigator, state],
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
