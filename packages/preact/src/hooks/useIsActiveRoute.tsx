import { createActiveRouteSource } from "@real-router/sources";
import { useMemo } from "preact/hooks";

import { useSyncExternalStore } from "../useSyncExternalStore";
import { useRouter } from "./useRouter";

import type { Params } from "@real-router/core";
import type { ActiveRouteSourceOptions } from "@real-router/sources";

export function useIsActiveRoute(
  routeName: string,
  params?: Params,
  strict = false,
  ignoreQueryParams = true,
  hash?: string,
): boolean {
  const router = useRouter();

  // createActiveRouteSource is per-router + canonical-args cached in
  // @real-router/sources. Caching the opts object + memoising the source
  // lookup avoids (a) re-allocating the literal on every render and (b)
  // re-running canonicalJson(params) on the cache lookup path. The `hash`
  // argument (#532) participates in the cache key — a tab Link pointing to
  // `/settings#account` shares its source only with consumers using the
  // same routeName + params + hash. exactOptionalPropertyTypes forbids
  // `{ hash: undefined }` literally, so we conditionally include the key
  // only when the caller passed a value.
  const opts = useMemo<ActiveRouteSourceOptions>(
    () =>
      hash === undefined
        ? { strict, ignoreQueryParams }
        : { strict, ignoreQueryParams, hash },
    [strict, ignoreQueryParams, hash],
  );

  const store = useMemo(
    () => createActiveRouteSource(router, routeName, params, opts),
    [router, routeName, params, opts],
  );

  return useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
}
