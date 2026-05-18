import { createActiveRouteSource } from "@real-router/sources";

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
 * @internal Consumed by `<Link>` via `createActiveRouteSource`. Not exported
 * from `@real-router/vue`.
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
