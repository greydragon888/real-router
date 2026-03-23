import { createActiveRouteSource } from "@real-router/sources";
import { useMemo } from "preact/hooks";

import { useSyncExternalStore } from "../useSyncExternalStore";
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
    store.getSnapshot,
  );
}
