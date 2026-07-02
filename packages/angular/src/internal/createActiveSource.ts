import {
  createActiveNameSelector,
  createActiveRouteSource,
} from "@real-router/sources";

import { buildActiveRouteOptions } from "./buildActiveRouteOptions";

import type { Params, Router } from "@real-router/core";
import type { RouterSource } from "@real-router/sources";

const NOOP = (): void => {};

/**
 * Build the active-route `RouterSource<boolean>` for a Link-style directive
 * (`RealLink`, `RealLinkActive`), choosing a fast or slow path from the inputs.
 *
 * **Fast path (#1103)** — a default-options link (a non-empty `routeName`, no
 * custom `params`, non-strict, query params ignored, no `hash`) shares the
 * per-router `createActiveNameSelector`: ONE `router.subscribe` handle serves
 * any number of distinct-`routeName` links, instead of a per-link
 * `createActiveRouteSource` (which allocates a `BaseSource` AND opens its own
 * router subscription for every link). This mirrors the Svelte adapter's fast
 * path ([#1101](https://github.com/greydragon888/real-router/pull/1101)) and the
 * Solid `routeSelector`. The selector is wrapped as a `RouterSource<boolean>`
 * (its `isActive` is exactly non-strict, query-ignoring, name-only matching —
 * identical to the default `createActiveRouteSource`) so the caller's existing
 * `subscribeSourceToSignal` pipeline is unchanged. `destroy()` is a no-op: the
 * selector is per-router cached and lives with the router; the returned
 * subscribe's unsubscribe removes just this link's listener.
 *
 * **Slow path** — any deviation from the defaults (custom `params`,
 * `activeStrict`, `ignoreQueryParams: false`, hash-aware #532) falls to the
 * per-link `createActiveRouteSource`, whose cache handles the full argument
 * surface. An **empty `routeName`** also takes the slow path: it is a misuse (it
 * builds no `href` and logs a `console.error`), and the selector's root-active
 * semantics (`isActive("") === true`) would flip a misused link to active,
 * whereas `router.isActiveRoute("")` returns `false` — the slow path preserves
 * that behaviour.
 */
export function createActiveSource(
  router: Router,
  routeName: string,
  params: Params | undefined,
  strict: boolean,
  ignoreQueryParams: boolean,
  hash: string | undefined,
): RouterSource<boolean> {
  if (
    routeName !== "" &&
    params === undefined &&
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

  return createActiveRouteSource(
    router,
    routeName,
    params,
    buildActiveRouteOptions(strict, ignoreQueryParams, hash),
  );
}
