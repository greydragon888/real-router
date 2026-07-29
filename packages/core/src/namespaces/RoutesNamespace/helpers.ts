// packages/core/src/namespaces/RoutesNamespace/helpers.ts

import { areParamValuesEqual, assertChannelCorrect } from "../../helpers";

import type { RoutesStore } from "./routesStore";
import type { RouteConfig } from "./types";
import type { Matcher, RouteDefinition, RouteTree } from "../../engine";
import type {
  DefaultDependencies,
  ForwardToCallback,
  Params,
  ParamsSearch,
  SearchParams,
  Route,
} from "../../types";

/**
 * Creates an empty RouteConfig.
 */
export function createEmptyConfig(): RouteConfig {
  return {
    decoders: Object.create(null) as Record<
      string,
      (channels: ParamsSearch) => ParamsSearch
    >,
    encoders: Object.create(null) as Record<
      string,
      (channels: ParamsSearch) => ParamsSearch
    >,
    defaultParams: Object.create(null) as Record<string, Params>,
    defaultSearch: Object.create(null) as Record<string, SearchParams>,
    forwardMap: Object.create(null) as Record<string, string>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    forwardFnMap: Object.create(null) as Record<string, ForwardToCallback<any>>,
  };
}

/**
 * Copies every {@link RouteConfig} sub-map's entries from `source` into
 * `target` (shallow per map — entries are shared by reference). Driven by
 * `Object.keys(source)` instead of one `Object.assign` per field, so a newly
 * added config sub-field is carried over automatically with nothing to forget
 * at each copy site (#965). Both configs are produced by
 * {@link createEmptyConfig}, so every key in `source` also exists on `target`,
 * and every value is a record object — the invariant this enumeration relies on.
 */
export function assignConfigEntries(
  target: RouteConfig,
  source: RouteConfig,
): void {
  for (const key of Object.keys(source) as (keyof RouteConfig)[]) {
    Object.assign(target[key], source[key]);
  }
}

// ============================================================================
// Route Tree Helpers
// ============================================================================

/**
 * Checks if all params from source exist with same values in target.
 * Small function body allows V8 inlining.
 */
export function paramsMatch(source: Params, target: Params): boolean {
  for (const key in source) {
    // Provenance-tolerant per value (#1554) — the hierarchical isActiveRoute
    // branch compares a caller bag against the COMMITTED state, whose values
    // may have come from the URL parser (`?tab=2` → `2`) while the caller wrote
    // strings. Same predicate as the exact branch (`areStatesEqual`), so both
    // branches answer identically for one location.
    if (!areParamValuesEqual(source[key], target[key])) {
      return false;
    }
  }

  return true;
}

/**
 * Sanitizes a route by keeping only essential properties.
 */
export function sanitizeRoute<Dependencies extends DefaultDependencies>(
  route: Route<Dependencies>,
): RouteDefinition {
  const sanitized: RouteDefinition = {
    name: route.name,
    path: route.path,
  };

  if (route.children) {
    sanitized.children = route.children.map((child) => sanitizeRoute(child));
  }

  return sanitized;
}

/**
 * Recursively removes a route from definitions array.
 */
export function removeFromDefinitions(
  definitions: RouteDefinition[],
  routeName: string,
  parentPrefix = "",
): boolean {
  for (let i = 0; i < definitions.length; i++) {
    const route = definitions[i];
    const fullName = parentPrefix
      ? `${parentPrefix}.${route.name}`
      : route.name;

    if (fullName === routeName) {
      definitions.splice(i, 1);

      return true;
    }

    if (
      route.children &&
      routeName.startsWith(`${fullName}.`) &&
      removeFromDefinitions(route.children, routeName, fullName)
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Clears configuration entries that match the predicate.
 */
export function clearConfigEntries<T>(
  config: Record<string, T>,
  matcher: (key: string) => boolean,
): void {
  for (const key of Object.keys(config)) {
    if (matcher(key)) {
      delete config[key];
    }
  }
}

/**
 * Used by matchPath() when trailingSlash is "preserve": the matcher's
 * buildPath() with an unset trailingSlash mode strips trailing slashes,
 * but "preserve" means the source path's trailing-slash choice wins.
 * If the source had a trailing slash, re-attach it to the rewritten path.
 * The reverse case (rewritten has trailing, source does not) is not
 * reachable with the current matcher — it never adds a trailing slash
 * with undefined mode.
 */
export function matchSourceTrailingSlash(
  sourcePath: string,
  rewrittenPath: string,
): string {
  const queryIndex = rewrittenPath.search(/[?#]/);
  const pathPart =
    queryIndex === -1 ? rewrittenPath : rewrittenPath.slice(0, queryIndex);

  // Stryker disable next-line LogicalOperator: equivalent — buildPath strips trailing slashes, so the rewritten path never ends with "/" unless it IS "/" (already caught by the `=== "/"` operand). `endsWith("/")` is unreachable-true, so `||` ≡ `&&`.
  if (pathPart === "/" || pathPart.endsWith("/")) {
    return rewrittenPath;
  }

  const sourceQueryIndex = sourcePath.search(/[?#]/);
  const sourcePathPart =
    sourceQueryIndex === -1
      ? sourcePath
      : sourcePath.slice(0, sourceQueryIndex);

  if (!(sourcePathPart.length > 1 && sourcePathPart.endsWith("/"))) {
    return rewrittenPath;
  }

  const querySuffix = queryIndex === -1 ? "" : rewrittenPath.slice(queryIndex);

  return `${pathPart}/${querySuffix}`;
}

// =============================================================================
// The query-channel registry — ONE derivation, shared by every reader (#1556)
// =============================================================================

/** Flattens the path-slot names declared across a route's matched segments. */
export function collectUrlParamsArray(
  segments: readonly RouteTree[],
): string[] {
  const params: string[] = [];

  for (const segment of segments) {
    for (const param of segment.paramMeta.urlParams) {
      params.push(param);
    }
  }

  return params;
}

/**
 * The route's PATH slot names, cached per route name.
 *
 * Store-level rather than a namespace method so the config-time channel check
 * reads the SAME registry the URL build prints from. A second derivation is
 * exactly the drift #1556 removed.
 */
export function urlParamsFor(
  matcher: Matcher,
  name: string,
  cache: Map<string, string[]>,
): string[] {
  const cached = cache.get(name);

  // Stryker disable next-line BlockStatement: equivalent — cache short-circuit; emptying the early-return recomputes the identical value (deterministic per route name) and re-caches it. (ConditionalExpression stays live: `→true` returns undefined on a cache miss = killed.)
  if (cached !== undefined) {
    return cached;
  }

  const segments = matcher.getSegmentsByName(name);
  const result = segments
    ? collectUrlParamsArray(segments as readonly RouteTree[])
    : [];

  cache.set(name, result);

  return result;
}

/** Store-bound {@link urlParamsFor}. */
export function urlParamsOf<Dependencies extends DefaultDependencies>(
  store: RoutesStore<Dependencies>,
  name: string,
): string[] {
  return urlParamsFor(store.matcher, name, store.urlParamsCache);
}

/**
 * The route's declared `?query` names minus its path slots — the registry that
 * both classifies and PRINTS (#1556), with the `/items/:id?id` carve-out
 * (#843 / #1549) falling out of the subtraction rather than being re-decided.
 */
export function queryParamsFor(
  matcher: Matcher,
  name: string,
  urlCache: Map<string, string[]>,
  queryCache: Map<string, string[]>,
): string[] {
  const cached = queryCache.get(name);

  // Stryker disable next-line BlockStatement: equivalent — cache short-circuit; emptying the early-return recomputes the identical value (deterministic per route name) and re-caches it. (ConditionalExpression stays live: `→true` returns undefined on a cache miss = killed.)
  if (cached !== undefined) {
    return cached;
  }

  const declared = matcher.getDeclaredQueryParams(name);
  let result: string[] = [];

  if (declared) {
    const urlParams = urlParamsFor(matcher, name, urlCache);

    result = declared.filter((param: string) => !urlParams.includes(param));
  }

  queryCache.set(name, result);

  return result;
}

/** Store-bound {@link queryParamsFor}. */
export function queryParamsOf<Dependencies extends DefaultDependencies>(
  store: RoutesStore<Dependencies>,
  name: string,
): string[] {
  return queryParamsFor(
    store.matcher,
    name,
    store.urlParamsCache,
    store.queryParamsCache,
  );
}

/**
 * Config-time channel check: a route's `defaultParams` may not name a key the
 * route declares with `?`.
 *
 * The static half of "params and search meet only in the URL". Without it the
 * router builds a state out of its OWN config that its OWN always-on channel
 * guard then rejects — `start()` throwing `WRONG_CHANNEL` about a bag the user
 * never passed, which is the deferred-crash shape core's invariant guards exist
 * to prevent. The dynamic half (a forwarding hop whose target is only known at
 * resolution) is caught at the `forwardState` seam instead.
 *
 * Runs over the WHOLE config after every rebuild rather than over the routes
 * just added: `setRootPath("?lang")` declares a name on every route at once, so
 * a config that was legal a moment ago can stop being legal without any route
 * changing.
 */
export function assertRouteDefaultChannels(
  matcher: Matcher,
  config: RouteConfig,
  method: string,
): void {
  // Local caches, not the store's: this runs on PREPARED artifacts, before any
  // swap. Checking after the swap would leave a rejected batch installed — the
  // atomicity `adoptRouteArtifacts` promises, broken by the very guard meant to
  // protect the config (caught by the entry-point test, which found the bad
  // config still in the store on the NEXT call).
  const urlCache = new Map<string, string[]>();
  const queryCache = new Map<string, string[]>();

  for (const [name, defaults] of Object.entries(config.defaultParams)) {
    assertChannelCorrect(
      method,
      name,
      defaults,
      queryParamsFor(matcher, name, urlCache, queryCache),
      "this route's `defaultParams`",
      "Move it to `defaultSearch`",
    );
  }
}
