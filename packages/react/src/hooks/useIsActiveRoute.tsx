// packages/react/modules/hooks/useIsActiveRoute.tsx

import { areRoutesRelated } from "@real-router/helpers";
import { useCallback, useMemo, useRef } from "react";

import { useRouterSubscription } from "./useRouterSubscription";
import { useStableValue } from "./useStableValue";
import { EMPTY_PARAMS } from "../constants";
import { createActiveCheckKey } from "../utils";

import type { Params, Router, State, SubscribeState } from "@real-router/core";

/**
 * Optimized hook to check if a route is active.
 * Minimizes unnecessary recalculations and re-renders.
 */
export function useIsActiveRoute(
  router: Router,
  routeName: string,
  routeParams: Params = EMPTY_PARAMS,
  activeStrict = false,
  ignoreQueryParams = true,
): boolean {
  // Stabilize params reference to prevent unnecessary recalculations
  const stableParams = useStableValue(routeParams);

  // Create stable cache key
  const cacheKey = useMemo(
    () =>
      createActiveCheckKey(
        routeName,
        stableParams,
        activeStrict,
        ignoreQueryParams,
      ),
    [routeName, stableParams, activeStrict, ignoreQueryParams],
  );

  // Cache the active state
  const isActiveRef = useRef<boolean | undefined>(undefined);
  const lastCacheKey = useRef<string | undefined>(undefined);

  if (lastCacheKey.current !== cacheKey) {
    isActiveRef.current = undefined;
    lastCacheKey.current = cacheKey;
  }

  // Optimize shouldUpdate to skip unrelated routes
  const shouldUpdate = useCallback(
    (newRoute: State, prevRoute?: State) => {
      const isNewRelated = areRoutesRelated(routeName, newRoute.name);
      const isPrevRelated =
        prevRoute && areRoutesRelated(routeName, prevRoute.name);

      return !!(isNewRelated || isPrevRelated);
    },
    [routeName],
  );

  // Selector that performs active check
  const selector = useCallback(
    (sub?: SubscribeState): boolean => {
      const currentRoute = sub?.route ?? router.getState();

      // Fast path: if no current route, not active
      if (!currentRoute) {
        isActiveRef.current = false;

        return false;
      }

      // Fast path: skip unrelated routes
      if (!areRoutesRelated(routeName, currentRoute.name)) {
        isActiveRef.current = false;

        return false;
      }

      // Full check for related routes
      const isActive = router.isActiveRoute(
        routeName,
        stableParams,
        activeStrict,
        ignoreQueryParams,
      );

      isActiveRef.current = isActive;

      return isActive;
    },
    [router, routeName, stableParams, activeStrict, ignoreQueryParams],
  );

  return useRouterSubscription(router, selector, shouldUpdate);
}
