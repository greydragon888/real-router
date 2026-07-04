import {
  createActiveNameSelector,
  createActiveRouteSource,
} from "@real-router/sources";
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

  // Fast path (#1248) — the default-options active check: no custom `params`,
  // non-strict, query params ignored, no `hash`. Resolve through the per-router
  // shared `createActiveNameSelector` — ONE `router.subscribe` handle serves any
  // number of distinct-`routeName` links — instead of a per-instance
  // `createActiveRouteSource` (a `BaseSource` AND its own router subscription for
  // every distinct name). Direct port of the svelte (#1101) / angular (#1104)
  // fast paths; the selector's `isActive` is exactly non-strict, query-ignoring,
  // name-only matching, identical to the default-options `createActiveRouteSource`.
  // Any deviation falls to the slow path below, whose canonical-args cache handles
  // the full surface (custom params, strict, `ignoreQueryParams: false`,
  // hash-aware #532).
  //
  // The `useMemo` wrap skips the branch + `canonicalJson(params)` + cache lookup
  // on every render when all primitive deps and the `params` reference are stable.
  // exactOptionalPropertyTypes forbids `{ hash: undefined }` literally, so we
  // conditionally spread the key only when the caller passed a value.
  const store = useMemo(() => {
    if (
      params === undefined &&
      !strict &&
      ignoreQueryParams &&
      hash === undefined
    ) {
      const selector = createActiveNameSelector(router);

      return {
        subscribe: (onChange: () => void) =>
          selector.subscribe(routeName, onChange),
        getSnapshot: () => selector.isActive(routeName),
      };
    }

    return createActiveRouteSource(router, routeName, params, {
      strict,
      ignoreQueryParams,
      ...(hash !== undefined && { hash }),
    });
  }, [router, routeName, params, strict, ignoreQueryParams, hash]);

  return useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
}
