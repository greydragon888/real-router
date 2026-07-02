import {
  createActiveNameSelector,
  createActiveRouteSource,
} from "@real-router/sources";
import { createSubscriber } from "svelte/reactivity";

import { createReactiveSource } from "../createReactiveSource.svelte";
import { useRouter } from "./useRouter.svelte";

import type { Params } from "@real-router/core";

export function useIsActiveRoute(
  routeName: string,
  params: Params | undefined,
  strict: boolean,
  ignoreQueryParams: boolean,
  hash?: string,
): { readonly current: boolean } {
  const router = useRouter();

  // Fast path (#1099) — the default-options `<Link>`: non-strict matching,
  // query params ignored, no custom `params`, no `hash`. Use the per-router
  // shared `ActiveNameSelector`: ONE `router.subscribe` handle serves any
  // number of distinct-`routeName` links, instead of a per-link
  // `createActiveRouteSource` (which allocates a `BaseSource` AND opens its own
  // router subscription for every link). This mirrors the Solid adapter's
  // `routeSelector` fast path and removes ~4 ms / 1000 links from the
  // link-build mount — the per-link source setup was the bulk of the Svelte
  // `<Link>`'s extra cost over the Solid adapter.
  //
  // Equivalence: the selector's `isActive` is exactly non-strict,
  // query-ignoring, name-only matching — identical to
  // `createActiveRouteSource(router, name, undefined, { strict: false,
  // ignoreQueryParams: true })`. Any deviation from these defaults falls to the
  // slow path below, whose cache handles the full argument surface (custom
  // params, strict, `ignoreQueryParams: false`, hash-aware #532).
  if (
    params === undefined &&
    !strict &&
    ignoreQueryParams &&
    hash === undefined
  ) {
    const selector = createActiveNameSelector(router);
    const subscribe = createSubscriber((update) =>
      selector.subscribe(routeName, update),
    );

    return {
      get current(): boolean {
        subscribe();

        return selector.isActive(routeName);
      },
    };
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

  return createReactiveSource(source);
}
