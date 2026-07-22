import { createActiveSource } from "@real-router/sources";

import { useRefFromSource } from "../useRefFromSource";
import { useRouter } from "./useRouter";

import type { Params } from "@real-router/core";
import type { ShallowRef } from "vue";

/**
 * Options object for `useIsActiveRoute`. Replaces the previous trailing
 * positional booleans (`strict`, `ignoreQueryParams`) — positional flags at
 * call sites read as magic numbers and the order was easy to swap silently.
 *
 * The composable is `@internal` (not exported from `@real-router/vue`), so the
 * signature changes without a deprecation cycle.
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
 * @internal Ref-returning form of the shared `createActiveSource` fast/slow
 * active-route builder — default-options links resolve through the per-router
 * `createActiveNameSelector` fast path (#1416), everything else through a cached
 * `createActiveRouteSource`. Not exported from `@real-router/vue`.
 *
 * `<Link>` does NOT call this composable — it calls `createActiveSource`
 * directly inside its reactive `watch`, because a composable runs once at
 * `setup()` and cannot re-bind the source when `<Link>`'s props change. Both go
 * through the one `createActiveSource` so the fast/slow decision (and the
 * `routeName !== ""` guard) live in a single place — the drift between the two
 * copies is exactly what produced #1416. Kept as a tested internal surface for a
 * static (non-reactive) active check.
 */
export function useIsActiveRoute(
  routeName: string,
  params?: Params,
  options?: UseIsActiveRouteOptions,
): ShallowRef<boolean> {
  const router = useRouter();

  return useRefFromSource(
    createActiveSource(
      router,
      routeName,
      params,
      // Query channel (RFC-4 M2, #1548) — no `routeSearch` on this hook yet;
      // `<Link routeSearch>` wires a real value through in a follow-up.
      undefined,
      options?.strict ?? false,
      options?.ignoreQueryParams ?? true,
      options?.hash,
    ),
  );
}
