import {
  createActiveNameSelector,
  createActiveRouteSource,
} from "@real-router/sources";

import type { Params, Router } from "@real-router/core";
import type { RouterSource } from "@real-router/sources";

const NOOP = (): void => {};

/**
 * Build the active-route `RouterSource<boolean>` for `<Link>` (in its reactive
 * `watch`) and the internal `useIsActiveRoute` composable, choosing a fast or
 * slow path from the inputs. Single source of truth for the fast/slow decision
 * so the two callers cannot drift (the drift that produced #1416: #1250 landed
 * the fast path in `useIsActiveRoute`, but `<Link>` kept its own unconditional
 * slow-path `createActiveRouteSource`).
 *
 * **Fast path (#1416)** — a default-options link (a non-empty `routeName`, no
 * custom `params`, non-strict, query params ignored, no `hash`) shares the
 * per-router `createActiveNameSelector`: ONE `router.subscribe` handle serves
 * any number of distinct-`routeName` links, instead of a per-link
 * `createActiveRouteSource` (which allocates a `BaseSource` AND opens its own
 * router subscription for every link — the exact 10k-listener-cap crash
 * documented in `createActiveRouteSource.ts`). Mirrors the angular (#1104) /
 * svelte (#1101) / react (#1248) / preact (#1249) fast paths; the selector's
 * `isActive` is exactly non-strict, query-ignoring, name-only matching —
 * identical to the default `createActiveRouteSource`. `destroy()` is a no-op:
 * the selector is per-router cached and lives with the router; the returned
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

  // The `hash` argument (#532) participates in the cache key when defined.
  // exactOptionalPropertyTypes forbids `{ hash: undefined }` literally — include
  // the `hash` key only when a value is provided.
  return createActiveRouteSource(
    router,
    routeName,
    params,
    hash === undefined
      ? { strict, ignoreQueryParams }
      : { strict, ignoreQueryParams, hash },
  );
}
