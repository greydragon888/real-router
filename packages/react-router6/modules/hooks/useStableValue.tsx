// packages/react-real-router/modules/hooks/useStableValue.tsx

import { useMemo } from "react";

/**
 * Stabilizes a value reference based on deep equality (via JSON serialization).
 * Returns the same reference until the serialized value changes.
 *
 * Useful for object/array dependencies in hooks like useMemo, useCallback, useEffect
 * to prevent unnecessary re-renders when the value is structurally the same.
 *
 * @example
 * ```tsx
 * const stableParams = useStableValue(routeParams);
 * const href = useMemo(() => {
 *   return router.buildUrl(routeName, stableParams);
 * }, [router, routeName, stableParams]);
 * ```
 *
 * @param value - The value to stabilize
 * @returns A stable reference to the value
 */
export function useStableValue<T>(value: T): T {
  const serialized = JSON.stringify(value);

  // We intentionally use serialized in deps to detect deep changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => value, [serialized]);
}
