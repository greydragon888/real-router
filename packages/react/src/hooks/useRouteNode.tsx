// packages/react/modules/hooks/useRouteNode.tsx

import { useCallback, useMemo } from "react";

import { useRouter } from "@real-router/react";

import { useRouterSubscription } from "./useRouterSubscription";
import { getCachedShouldUpdate } from "../utils";

import type { RouteContext, RouteState } from "../types";
import type { State, SubscribeState } from "@real-router/core";

/**
 * Hook that subscribes to a specific route node with optimizations.
 * Provides the current and previous route when the node is affected.
 */
export function useRouteNode(nodeName: string): RouteContext {
  // Get router from context with error handling
  const router = useRouter();

  // Get cached shouldUpdate function to avoid recreation
  const shouldUpdate = useMemo(
    () => getCachedShouldUpdate(router, nodeName),
    [router, nodeName],
  );

  // Stable state factory
  // useRouteNode.tsx
  const stateFactory = useCallback(
    (sub?: SubscribeState): RouteState => {
      const currentRoute = sub?.route ?? router.getState();

      // Проверяем, активен ли узел
      if (currentRoute && nodeName !== "") {
        // Корневой узел всегда активен
        const isNodeActive =
          currentRoute.name === nodeName ||
          currentRoute.name.startsWith(`${nodeName}.`);

        if (!isNodeActive) {
          return {
            route: undefined,
            previousRoute: sub?.previousRoute,
          };
        }
      }

      return {
        route: currentRoute,
        previousRoute: sub?.previousRoute,
      };
    },
    [router, nodeName],
  );

  // Subscribe to router with optimization
  const state = useRouterSubscription<RouteState>(
    router,
    stateFactory,
    shouldUpdate as (newRoute: State, prevRoute?: State) => boolean,
  );

  // Return memoized context - useMemo ensures stable reference when deps unchanged
  return useMemo(
    (): RouteContext => ({
      router,
      route: state.route,
      previousRoute: state.previousRoute,
    }),
    [router, state.route, state.previousRoute],
  );
}
