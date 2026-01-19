// packages/react-router6/modules/RouterProvider.tsx

import { useMemo, useSyncExternalStore } from "react";

import { RouteContext, RouterContext } from "./context";

import type { RouteState } from "./types";
import type { FC, ReactNode } from "react";
import type { Router } from "router6";

export interface RouteProviderProps {
  router: Router;
  children: ReactNode;
}

export const RouterProvider: FC<RouteProviderProps> = ({
  router,
  children,
}) => {
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

  return (
    <RouterContext.Provider value={router}>
      <RouteContext.Provider value={{ router, ...state }}>
        {children}
      </RouteContext.Provider>
    </RouterContext.Provider>
  );
};
