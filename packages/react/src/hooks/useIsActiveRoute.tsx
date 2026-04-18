import { createActiveRouteSource } from "@real-router/sources";
import { useSyncExternalStore } from "react";

import { useRouter } from "./useRouter";

import type { Params } from "@real-router/core";

export function useIsActiveRoute(
  routeName: string,
  params?: Params,
  strict = false,
  ignoreQueryParams = true,
): boolean {
  const router = useRouter();

  // createActiveRouteSource is per-router + canonical-args cached in
  // @real-router/sources, so passing params by reference is safe — equivalent
  // param shapes hit the same cache entry regardless of key order.
  const store = createActiveRouteSource(router, routeName, params, {
    strict,
    ignoreQueryParams,
  });

  return useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
}
