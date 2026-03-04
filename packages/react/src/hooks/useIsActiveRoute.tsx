import { createActiveRouteSource } from "@real-router/sources";
import { useMemo, useSyncExternalStore } from "react";

import { useRouter } from "./useRouter";
import { useStableValue } from "./useStableValue";

import type { Params } from "@real-router/core";

export function useIsActiveRoute(
  routeName: string,
  params?: Params,
  strict = false,
  ignoreQueryParams = true,
): boolean {
  const router = useRouter();

  // useStableValue: JSON.stringify memoization of params object.
  // Without it, every render with a new params reference (e.g.,
  // <Link routeParams={{ id: '123' }} />) would recreate the store.
  const stableParams = useStableValue(params);

  const store = useMemo(
    () =>
      createActiveRouteSource(router, routeName, stableParams, {
        strict,
        ignoreQueryParams,
      }),
    [router, routeName, stableParams, strict, ignoreQueryParams],
  );

  return useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot, // SSR: router returns same state on server and client
  );
}
