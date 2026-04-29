import { createActiveRouteSource } from "@real-router/sources";

import { useSyncExternalStore } from "../useSyncExternalStore";
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
  // @real-router/sources, so passing params by reference is safe. The
  // `hash` argument (#532) participates in the cache key — a tab Link
  // pointing to `/settings#account` shares its source only with consumers
  // using the same routeName + params + hash.
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
