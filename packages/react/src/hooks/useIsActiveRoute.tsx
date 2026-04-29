import { createActiveRouteSource } from "@real-router/sources";
import { useSyncExternalStore } from "react";

import { useRouter } from "./useRouter";

import type { Params } from "@real-router/core";

export function useIsActiveRoute(
  routeName: string,
  params?: Params,
  strict = false,
  ignoreQueryParams = true,
  hash?: string,
): boolean {
  const router = useRouter();

  // createActiveRouteSource is per-router + canonical-args cached in
  // @real-router/sources, so passing params by reference is safe — equivalent
  // param shapes hit the same cache entry regardless of key order. The
  // `hash` argument (#532) is part of the cache key when defined: a Link
  // pointing to `/settings#account` shares its source only with other
  // consumers using the same routeName + params + hash.
  // exactOptionalPropertyTypes forbids `{ hash: undefined }` literally, so
  // we conditionally include the key only when the caller passed a value.
  const store = createActiveRouteSource(
    router,
    routeName,
    params,
    hash === undefined
      ? { strict, ignoreQueryParams }
      : { strict, ignoreQueryParams, hash },
  );

  return useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
}
