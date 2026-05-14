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

    // Delimiter `|` is safe because route names use `.` as the segment
    // separator (`users.list`, not `users|list`) and canonicalJson-encoded
    // params escape `"` (so any literal `|` inside params lives inside a
    // quoted JSON string and can't be confused with our delimiter). If route
    // names ever grow a `|` character, this composite key would become
    // ambiguous — change the separator to a control char or hash-encode each
    // field.
    key = `${routeName}|${canonicalJson(params)}|${String(strict)}|${String(ignoreQueryParams)}|${hashKey}`;
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
 * Reads the URL fragment published by browser/navigation plugins on the given
 * router state. Returns `""` when no plugin claims the `"url"` namespace
 * (hash-plugin runtime, memory-plugin, SSR) — `undefined` is reserved for
 * "no published fragment yet" and not visible at the source layer.
 */
function readContextHash(router: Router): string {
  const ctx = router.getState()?.context as
    | { url?: { hash?: string } }
    | undefined;

  return ctx?.url?.hash ?? "";
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
  strict: boolean,
  ignoreQueryParams: boolean,
  hash: string | undefined,
): boolean {
  const routeActive = router.isActiveRoute(
    routeName,
    params,
    strict,
    ignoreQueryParams,
  );

  if (!routeActive) {
    return false;
  }
  if (hash === undefined) {
    return true;
  }

  return readContextHash(router) === hash;
}

function buildActiveRouteSource(
  router: Router,
  routeName: string,
  params: Params | undefined,
  strict: boolean,
  ignoreQueryParams: boolean,
  hash: string | undefined,
): RouterSource<boolean> {
  const initialValue = computeActive(
    router,
    routeName,
    params,
    strict,
    ignoreQueryParams,
    hash,
  );

  let routerUnsubscribe: (() => void) | undefined;

  const source = new BaseSource(initialValue, {
    onDestroy: () => {
      routerUnsubscribe?.();
      routerUnsubscribe = undefined;
    },
  });

  // Eager connection: subscribe to router immediately. For the cached path,
  // the returned wrapper has a no-op destroy and the handle lives with the
  // router (released on router GC). For the non-cached fallback (BigInt /
  // circular params), the handle is unwound through `onDestroy` above.
  routerUnsubscribe = router.subscribe((next) => {
    const isNewRelated = areRoutesRelated(routeName, next.route.name);
    const isPrevRelated =
      next.previousRoute &&
      areRoutesRelated(routeName, next.previousRoute.name);

    // Hash-aware sources also flip on same-path-different-hash transitions.
    // The route comparison alone misses these (route is identical), but the
    // hash claim updated, so we must re-evaluate. Detect via the `hashChanged`
    // flag published by URL plugins.
    const hashFlip =
      hash !== undefined &&
      ((next.route.context as { url?: { hashChanged?: boolean } } | undefined)
        ?.url?.hashChanged ??
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
          strict,
          ignoreQueryParams,
          hash,
        )
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
