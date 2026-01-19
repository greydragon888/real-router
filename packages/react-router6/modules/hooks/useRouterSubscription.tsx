// packages/react-real-router/modules/hooks/useRouterSubscription.tsx

import { useCallback, useRef, useSyncExternalStore } from "react";

import type { Router, State, SubscribeState } from "router6";

/**
 * Generic hook for subscribing to router changes with optimization.
 *
 * @param router - Router6 instance
 * @param selector - Function to derive state from router subscription
 * @param shouldUpdate - Optional predicate to filter updates
 */
export function useRouterSubscription<T>(
  router: Router,
  selector: (sub?: SubscribeState) => T,
  shouldUpdate?: (newRoute: State, prevRoute?: State) => boolean,
): T {
  // Store current value
  const stateRef = useRef<T | undefined>(undefined);
  const selectorRef = useRef(selector);
  const shouldUpdateRef = useRef(shouldUpdate);

  // Update refs to avoid stale closures
  selectorRef.current = selector;
  shouldUpdateRef.current = shouldUpdate;

  // Lazy initialization
  if (stateRef.current === undefined) {
    // Get initial state from router
    const currentState = router.getState();

    // Check if initial state is relevant for this subscription
    const shouldInitialize =
      !shouldUpdateRef.current ||
      (currentState && shouldUpdateRef.current(currentState));

    stateRef.current = selectorRef.current(
      shouldInitialize && currentState
        ? { route: currentState, previousRoute: undefined }
        : undefined,
    );
  }

  // Stable snapshot getter
  const getSnapshot = useCallback(() => stateRef.current as T, []);

  // Subscribe function with optimization
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      return router.subscribe((next) => {
        // Check if we should process this update
        let shouldProcess = true;

        if (shouldUpdateRef.current) {
          shouldProcess = shouldUpdateRef.current(
            next.route,
            next.previousRoute,
          );
        }

        if (!shouldProcess) {
          return;
        }

        // Calculate new value
        const newValue = selectorRef.current(next);

        // Only trigger update if value actually changed
        if (!Object.is(stateRef.current, newValue)) {
          stateRef.current = newValue;

          onStoreChange();
        }
      });
    },
    [router],
  );

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
