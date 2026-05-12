import { createActiveRouteSource } from "@real-router/sources";
import { useMemo, useSyncExternalStore } from "react";

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
  //
  // The useMemo wrap skips `canonicalJson(params)` + cache lookup on every
  // render when all primitive deps and the `params` reference are stable —
  // the common case once memo()+shallowEqual has bailed out further up
  // (or when the parent re-renders for a non-Link reason). For inline
  // `params={{id:1}}` the dep changes per render and the lookup still
  // runs, but that path was already the slow path before this memo.
  // exactOptionalPropertyTypes forbids `{ hash: undefined }` literally, so
  // we conditionally include the key only when the caller passed a value.
  const store = useMemo(
    () =>
      createActiveRouteSource(
        router,
        routeName,
        params,
        hash === undefined
          ? { strict, ignoreQueryParams }
          : { strict, ignoreQueryParams, hash },
      ),
    [router, routeName, params, strict, ignoreQueryParams, hash],
  );

  return useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
}
