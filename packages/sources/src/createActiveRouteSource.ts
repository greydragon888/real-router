import { areRoutesRelated } from "@real-router/route-utils";

import { BaseSource } from "./BaseSource";
import { canonicalJson } from "./canonicalJson.js";
import { noopDestroy } from "./internal/noopDestroy.js";
import { readContextHash } from "./internal/readContextHash.js";
import { normalizeActiveOptions } from "./normalizeActiveOptions.js";

import type { ActiveRouteSourceOptions, RouterSource } from "./types.js";
import type { Params, Router, SearchParams } from "@real-router/core";

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
 * For cached entries `destroy()` is a no-op — shared sources live with the
 * router and release automatically on router GC (WeakMap entry).
 *
 * `BigInt`/circular params can't be serialized → the source bypasses the cache
 * and `destroy()` becomes a real teardown that detaches the underlying
 * `router.subscribe` handle.
 */
export function createActiveRouteSource(
  router: Router,
  routeName: string,
  params?: Params,
  search?: SearchParams,
  options?: ActiveRouteSourceOptions,
): RouterSource<boolean> {
  const { strict, ignoreQueryParams, hash } = normalizeActiveOptions(options);

  // BigInt/Symbol/circular refs cannot be serialized — fall back to creating
  // a fresh (non-cached) source. Callers pass these edge-case params rarely;
  // the extra allocation is acceptable.
  let key: string | undefined;

  try {
    // `hash === undefined` produces "" via String(undefined) → "undefined";
    // we encode it as the empty string sentinel to keep the key short and
    // distinct from the literal "undefined" hash value (which is a valid,
    // if unusual, fragment).
    const hashKey = hash === undefined ? "" : `#${hash}`;

    // `params === undefined` is the common Link case (`<Link to="users">`
    // with no params). Skip canonicalJson(undefined) — it returns the literal
    // string "undefined" and template interpolation would just embed it. An
    // explicit empty sentinel avoids the call and shaves the cache-key by 9
    // characters per Link.
    const paramsKey = params === undefined ? "" : canonicalJson(params);

    // Query channel (RFC-4 M2, #1548) — keyed the same way as `params`:
    // `undefined` (the common no-search Link) collapses to the empty sentinel
    // to skip `canonicalJson(undefined)` and share one entry with a no-search
    // call. Distinct from `params` so `{ search: { q } }` and `{ params: { q } }`
    // never collide on the same cache slot.
    const searchKey = search === undefined ? "" : canonicalJson(search);

    // Delimiter `|` is safe because route names use `.` as the segment
    // separator (`users.list`, not `users|list`) and canonicalJson-encoded
    // params escape `"` (so any literal `|` inside params lives inside a
    // quoted JSON string and can't be confused with our delimiter). If route
    // names ever grow a `|` character, this composite key would become
    // ambiguous — change the separator to a control char or hash-encode each
    // field.
    key = `${routeName}|${paramsKey}|${searchKey}|${String(strict)}|${String(ignoreQueryParams)}|${hashKey}`;
  } catch {
    key = undefined;
  }

  if (key === undefined) {
    // Non-cached fallback (canonicalJson threw on BigInt / circular / etc.).
    // Return the real source — `destroy()` must unwind the router subscription;
    // otherwise the wrapper leaks for the lifetime of the router.
    return buildActiveRouteSource(
      router,
      routeName,
      params,
      search,
      strict,
      ignoreQueryParams,
      hash,
    );
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
      search,
      strict,
      ignoreQueryParams,
      hash,
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

/**
 * Combines route-name match with optional hash match (#532).
 *
 * - Route-name match: `router.isActiveRoute(name, params, strict, ignoreQueryParams)`.
 * - Hash match (only when `hash !== undefined`): `state.context.url.hash` must
 *   equal the requested fragment exactly. With hash-plugin (no `url`
 *   namespace), this returns `false` — the documented limitation.
 */
function computeActive(
  router: Router,
  routeName: string,
  params: Params | undefined,
  search: SearchParams | undefined,
  strict: boolean,
  ignoreQueryParams: boolean,
  hash: string | undefined,
): boolean {
  const routeActive = router.isActiveRoute(
    routeName,
    params,
    // Query channel at position 3 (RFC-4 M2 / #1548). `isActiveRoute` only
    // consults it when `ignoreQueryParams` is false — the default active-route
    // match (ignoreQueryParams: true) still ignores it, so a `routeSearch`-less
    // Link behaves exactly as before.
    search,
    strict,
    ignoreQueryParams,
  );

  if (!routeActive) {
    return false;
  }
  if (hash === undefined) {
    return true;
  }

  // `readContextHash` returns `undefined` when no URL plugin claimed the
  // namespace (hash-plugin runtime, memory-plugin, SSR). For hash-equality
  // matching we collapse that to `""` — a hash-aware Link with no URL plugin
  // can only match when the consumer also asked for `hash: ""`.
  return (readContextHash(router.getState()) ?? "") === hash;
}

function buildActiveRouteSource(
  router: Router,
  routeName: string,
  params: Params | undefined,
  search: SearchParams | undefined,
  strict: boolean,
  ignoreQueryParams: boolean,
  hash: string | undefined,
): RouterSource<boolean> {
  const initialValue = computeActive(
    router,
    routeName,
    params,
    search,
    strict,
    ignoreQueryParams,
    hash,
  );

  let routerUnsubscribe: (() => void) | undefined;

  const disconnect = (): void => {
    const unsub = routerUnsubscribe;

    routerUnsubscribe = undefined;
    unsub?.();
  };

  const source = new BaseSource(initialValue, {
    onFirstSubscribe: () => {
      // Reconcile before connecting: while disconnected (zero listeners) the
      // source missed navigations, so the active boolean may be stale.
      // Recompute against the current router state and notify the just-added
      // listener — BaseSource registers it before onFirstSubscribe. Mirrors the
      // reconnect reconcile of createRouteNodeSource / createRouteSource (#765).
      const reconciled = computeActive(
        router,
        routeName,
        params,
        search,
        strict,
        ignoreQueryParams,
        hash,
      );

      if (!Object.is(source.getSnapshot(), reconciled)) {
        source.updateSnapshot(reconciled);
      }

      // Lazy connection (#766): subscribe on the FIRST listener, disconnect on
      // the LAST (onLastUnsubscribe). Previously this source subscribed eagerly
      // at construction with a no-op destroy on the cached wrapper, so every
      // unique cache key held a PERMANENT router subscription that survived all
      // Link unmounts — a long-lived router with per-item-params Links
      // accumulated handles until the EventEmitter listener limit (10000)
      // crashed the render path. The cache entry still lives with the router
      // (cheap: a closure), but now holds no subscription while it has zero
      // listeners; the non-cached fallback (BigInt / circular params) likewise
      // detaches through `disconnect`.
      routerUnsubscribe = router.subscribe((next) => {
        const isNewRelated = areRoutesRelated(routeName, next.route.name);
        const isPrevRelated =
          next.previousRoute &&
          areRoutesRelated(routeName, next.previousRoute.name);

        // Hash-aware sources also flip on same-path-different-hash transitions.
        // The route comparison alone misses these (route is identical), but the
        // hash claim updated, so we must re-evaluate. Detect via the
        // `hashChanged` flag published by URL plugins.
        const hashFlip =
          hash !== undefined &&
          ((
            next.route.context as
              { url?: { hashChanged?: boolean } } | undefined
          )?.url?.hashChanged ??
            false);

        if (!isNewRelated && !isPrevRelated && !hashFlip) {
          return;
        }

        // If new route is not related, we know the route is inactive —
        // avoid calling isActiveRoute for the optimization. (Hash check would
        // also fail without route-match, so this short-circuit holds for
        // hash-aware sources too.)
        const newValue = isNewRelated
          ? computeActive(
              router,
              routeName,
              params,
              search,
              strict,
              ignoreQueryParams,
              hash,
            )
          : false;

        if (!Object.is(source.getSnapshot(), newValue)) {
          source.updateSnapshot(newValue);
        }
      });
    },
    onLastUnsubscribe: disconnect,
    onDestroy: disconnect,
  });

  return source;
}
