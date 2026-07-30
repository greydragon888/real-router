import { createActiveNameSelector } from "./createActiveNameSelector.js";
import { createActiveRouteSource } from "./createActiveRouteSource.js";

import type { RouterSource } from "./types.js";
import type { Params, Router, SearchParams } from "@real-router/core";

const NOOP = (): void => {};

/**
 * Framework-agnostic fast/slow builder for an adapter `<Link>`'s active-route
 * `RouterSource<boolean>`. Every adapter Link routes its active-state check
 * through this one function so the fast/slow decision (and the `routeName !== ""`
 * guard) lives in a single place — a per-adapter copy of the decision drifting
 * from the shared one is exactly what produced #1416 (the vue Link kept building
 * a per-link source while the fast path sat unused in a composable).
 *
 * **Fast path** — a default-options link (non-empty `routeName`, no custom
 * `params`, non-strict, query params ignored, no `hash`) shares the per-router
 * {@link createActiveNameSelector}: ONE `router.subscribe` handle serves any
 * number of distinct-`routeName` links, versus a per-link
 * {@link createActiveRouteSource} that allocates a `BaseSource` AND opens its own
 * router subscription for every link (the 10k-listener-cap crash documented on
 * `createActiveRouteSource`). The selector's `isActive` is exactly non-strict,
 * query-ignoring, name-only matching — identical to the default
 * `createActiveRouteSource`. `destroy()` is a no-op (the selector is per-router
 * cached and outlives the link); the returned `subscribe`'s unsubscribe removes
 * only this link's listener.
 *
 * **Slow path** — any deviation from the defaults (custom `params`, `strict`,
 * `ignoreQueryParams: false`, hash-aware #532) falls to the per-link
 * `createActiveRouteSource`, whose cache covers the full argument surface. An
 * **empty `routeName`** also takes the slow path: it is a misuse (builds no href,
 * logs a `console.error`), and the selector's root-active `isActive("") === true`
 * would light up a misused link, whereas `router.isActiveRoute("")` is `false` —
 * the slow path preserves that.
 */
export function createActiveSource(
  router: Router,
  routeName: string,
  params: Params | undefined,
  search: SearchParams | undefined,
  strict: boolean,
  ignoreQueryParams: boolean,
  hash: string | undefined,
): RouterSource<boolean> {
  if (
    routeName !== "" &&
    params === undefined &&
    // A `routeSearch` link forces the slow path (RFC-4 M2, #1548): the
    // name-only selector is search-blind, so it can't answer a query-scoped
    // active check — exactly the reason a custom `hash` also falls through.
    search === undefined &&
    !strict &&
    ignoreQueryParams &&
    hash === undefined
  ) {
    const selector = createActiveNameSelector(router);

    return {
      subscribe: (listener) => selector.subscribe(routeName, listener),
      getSnapshot: () => selector.isActive(routeName),
      destroy: NOOP,
    };
  }

  // The `hash` argument (#532) participates in the cache key when defined.
  // exactOptionalPropertyTypes forbids `{ hash: undefined }` literally — include
  // the `hash` key only when a value is provided.
  return createActiveRouteSource(
    router,
    routeName,
    params,
    search,
    hash === undefined
      ? { strict, ignoreQueryParams }
      : { strict, ignoreQueryParams, hash },
  );
}
