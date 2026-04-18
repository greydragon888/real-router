import { areRoutesRelated } from "@real-router/route-utils";

import { BaseSource } from "./BaseSource";
import { canonicalJson } from "./canonicalJson.js";
import { normalizeActiveOptions } from "./normalizeActiveOptions.js";

import type { ActiveRouteSourceOptions, RouterSource } from "./types.js";
import type { Params, Router } from "@real-router/core";

const activeSourceCache = new WeakMap<
  Router,
  Map<string, RouterSource<boolean>>
>();

/**
 * Creates a source tracking whether a route (with given params/options) is active.
 *
 * **Per-router + canonical-args cache:** repeated calls with equivalent
 * arguments return the same shared instance. Param key order doesn't matter
 * (`{ a:1, b:2 }` and `{ b:2, a:1 }` hit the same cache entry via
 * `canonicalJson`).
 *
 * `destroy()` is a no-op — shared sources live with the router. The router
 * subscription stays active while any consumer subscribes; when the router
 * is garbage-collected, the WeakMap entry releases automatically.
 *
 * Edge cases: `Symbol`/`BigInt` in params bypass `canonicalJson` and produce
 * an unstable cache key — these will simply miss the cache and create a new
 * source on each call. Practical params are primitives, so this is not a
 * concern in real usage.
 */
export function createActiveRouteSource(
  router: Router,
  routeName: string,
  params?: Params,
  options?: ActiveRouteSourceOptions,
): RouterSource<boolean> {
  const { strict, ignoreQueryParams } = normalizeActiveOptions(options);

  // BigInt/Symbol/circular refs cannot be serialized — fall back to creating
  // a fresh (non-cached) source. Callers pass these edge-case params rarely;
  // the extra allocation is acceptable.
  let key: string | undefined;

  try {
    key = `${routeName}|${canonicalJson(params)}|${String(strict)}|${String(ignoreQueryParams)}`;
  } catch {
    key = undefined;
  }

  if (key === undefined) {
    const source = buildActiveRouteSource(
      router,
      routeName,
      params,
      strict,
      ignoreQueryParams,
    );

    return {
      subscribe: source.subscribe,
      getSnapshot: source.getSnapshot,
      destroy: noopDestroy,
    };
  }

  let perRouter = activeSourceCache.get(router);

  if (!perRouter) {
    perRouter = new Map();
    activeSourceCache.set(router, perRouter);
  }

  let cached = perRouter.get(key);

  if (!cached) {
    const source = buildActiveRouteSource(
      router,
      routeName,
      params,
      strict,
      ignoreQueryParams,
    );

    cached = {
      subscribe: source.subscribe,
      getSnapshot: source.getSnapshot,
      destroy: noopDestroy,
    };
    perRouter.set(key, cached);
  }

  return cached;
}

function buildActiveRouteSource(
  router: Router,
  routeName: string,
  params: Params | undefined,
  strict: boolean,
  ignoreQueryParams: boolean,
): RouterSource<boolean> {
  const initialValue = router.isActiveRoute(
    routeName,
    params,
    strict,
    ignoreQueryParams,
  );

  const source = new BaseSource(initialValue);

  // Eager connection: subscribe to router immediately. This source is only
  // ever reached through the cached public `createActiveRouteSource`, whose
  // returned wrapper has a no-op destroy. The source lives with the router;
  // the router.subscribe handle is released on router GC.
  router.subscribe((next) => {
    const isNewRelated = areRoutesRelated(routeName, next.route.name);
    const isPrevRelated =
      next.previousRoute &&
      areRoutesRelated(routeName, next.previousRoute.name);

    if (!isNewRelated && !isPrevRelated) {
      return;
    }

    // If new route is not related, we know the route is inactive —
    // avoid calling isActiveRoute for the optimization
    const newValue = isNewRelated
      ? router.isActiveRoute(routeName, params, strict, ignoreQueryParams)
      : false;

    if (!Object.is(source.getSnapshot(), newValue)) {
      source.updateSnapshot(newValue);
    }
  });

  return source;
}

function noopDestroy(): void {
  // Shared cached source — external destroy() is a no-op.
}
