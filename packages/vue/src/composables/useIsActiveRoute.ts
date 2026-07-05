import {
  createActiveNameSelector,
  createActiveRouteSource,
} from "@real-router/sources";

import { useRefFromSource } from "../useRefFromSource";
import { useRouter } from "./useRouter";

import type { Params } from "@real-router/core";
import type { ShallowRef } from "vue";

/**
 * Options object for `useIsActiveRoute`. Replaces the previous trailing
 * positional booleans (`strict`, `ignoreQueryParams`) — positional flags at
 * call sites read as magic numbers and the order was easy to swap silently.
 *
 * The composable is `@internal` (consumed by `<Link>` and tests only), so
 * the signature changes without a deprecation cycle.
 */
export interface UseIsActiveRouteOptions {
  /**
   * Match the route name exactly (no descendant match). Default: `false`.
   */
  strict?: boolean;
  /**
   * Ignore query params when comparing the active route. Default: `true`.
   */
  ignoreQueryParams?: boolean;
  /**
   * Hash-aware active state (#532) — when provided, the route is active only
   * if `state.context.url.hash` equals this value. Default: `undefined`
   * (hash is ignored).
   */
  hash?: string;
}

/**
 * @internal Consumed by `<Link>`. Not exported from `@real-router/vue`.
 */
export function useIsActiveRoute(
  routeName: string,
  params?: Params,
  options?: UseIsActiveRouteOptions,
): ShallowRef<boolean> {
  const router = useRouter();
  const strict = options?.strict ?? false;
  const ignoreQueryParams = options?.ignoreQueryParams ?? true;
  const hash = options?.hash;

  // Fast path (#1250) — the default-options active check: no custom `params`,
  // non-strict, query params ignored, no `hash`. Resolve through the per-router
  // shared `createActiveNameSelector` — ONE `router.subscribe` handle serves any
  // number of distinct-`routeName` links — instead of a per-instance
  // `createActiveRouteSource` (a `BaseSource` AND its own router subscription for
  // every distinct name). Direct port of the svelte (#1101) / angular (#1104) /
  // react (#1248) / preact (#1249) fast paths; the selector's `isActive` is
  // exactly non-strict, query-ignoring, name-only matching. Any deviation falls
  // to the slow path below, whose canonical-args cache handles the full surface
  // (custom params, strict, `ignoreQueryParams: false`, hash-aware #532).
  if (
    params === undefined &&
    !strict &&
    ignoreQueryParams &&
    hash === undefined
  ) {
    const selector = createActiveNameSelector(router);

    return useRefFromSource({
      subscribe: (listener: () => void) =>
        selector.subscribe(routeName, listener),
      getSnapshot: () => selector.isActive(routeName),
    });
  }

  // The `hash` argument (#532) participates in the cache key when defined.
  // exactOptionalPropertyTypes forbids `{ hash: undefined }` literally — we
  // conditionally include the key only when a value is provided.
  const source = createActiveRouteSource(
    router,
    routeName,
    params,
    hash === undefined
      ? { strict, ignoreQueryParams }
      : { strict, ignoreQueryParams, hash },
  );

  return useRefFromSource(source);
}
