// packages/core/src/namespaces/RoutesNamespace/helpers.ts

import {
  assertRouteDefaultChannels,
  assertRouteDefaultsSafe,
} from "../../channels";
import { areParamValuesEqual } from "../../helpers";

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
 * Does ANY route in this config forward? The tree-wide answer behind
 * `RoutesStore.hasAnyForward` — see that field for why one boolean is worth
 * deriving (#1595).
 *
 * Deliberately NOT a field on {@link RouteConfig}: {@link assignConfigEntries}
 * enumerates that interface's values and assumes every one is a record object,
 * so a boolean there would be copied as if it had entries.
 */
export function anyForwardConfigured(config: RouteConfig): boolean {
  return (
    Object.keys(config.forwardMap).length > 0 ||
    Object.keys(config.forwardFnMap).length > 0
  );
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
 * Collects the FULL dotted names of `node` and every real descendant of it,
 * into `into`. `fullName` is the node's own full name — children extend it,
 * because a nested definition carries a BARE name.
 */
function collectDefinitionNames(
  node: RouteDefinition,
  fullName: string,
  into: Set<string>,
): void {
  into.add(fullName);

  if (node.children) {
    for (const child of node.children) {
      collectDefinitionNames(child, `${fullName}.${child.name}`, into);
    }
  }
}

/**
 * Removes `routeName` from `definitions` and reports the full dotted names it
 * ACTUALLY took with it — the spliced node plus its real `children`, and
 * nothing else. `undefined` when the name is not a definition at all.
 *
 * ⚑ The returned set is the AUTHORITY on "what this removal removed" (#1757),
 * and it exists because the alternative — testing a name for the string prefix
 * `${routeName}.` — answers a strictly WIDER question. Core accepts a dotted
 * LEAF name, so `{ name: "x.y" }` declared beside `{ name: "x" }` is a
 * standalone top-level node: the splice never touches it, yet the prefix test
 * claims it. Four sites asked the string and were wrong on exactly that shape —
 * the config/lifecycle purge (a fail-open: the survivor's blocking
 * `canActivate` was unregistered), the `forwardMap` value sweep, the
 * `TREE_CHANGED` payload, and the active-route refusal.
 *
 * Structural rather than lexical, so it is right for BOTH spellings by
 * construction: a real child is inside the spliced node and is collected; a
 * flat namesake is a sibling in the array and is not.
 */
export function spliceSubtree(
  definitions: RouteDefinition[],
  routeName: string,
  parentPrefix = "",
): Set<string> | undefined {
  for (let i = 0; i < definitions.length; i++) {
    const route = definitions[i];
    const fullName = parentPrefix
      ? `${parentPrefix}.${route.name}`
      : route.name;

    if (fullName === routeName) {
      definitions.splice(i, 1);

      const removed = new Set<string>();

      collectDefinitionNames(route, fullName, removed);

      return removed;
    }

    if (route.children && routeName.startsWith(`${fullName}.`)) {
      const removed = spliceSubtree(route.children, routeName, fullName);

      if (removed) {
        return removed;
      }
    }
  }

  return undefined;
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
 * Store-layer adapter for {@link assertRouteDefaultChannels}: supplies the
 * declared-query accessor the pure rule takes as data.
 *
 * The caches are LOCAL to the attempt, not the store's, and that is the whole
 * reason this adapter exists rather than the four entry points each building the
 * closure. Every caller runs on PREPARED artifacts, before any swap: validating
 * against the store's caches would answer about a tree the rejected batch has
 * not installed — and the guard would then be checking the wrong config while
 * claiming to protect the right one.
 */
export function assertRouteDefaultChannelsFor(
  matcher: Matcher,
  config: RouteConfig,
  method: string,
): void {
  const urlCache = new Map<string, string[]>();
  const queryCache = new Map<string, string[]>();

  assertRouteDefaultsSafe(config.defaultParams, config.defaultSearch, method);

  assertRouteDefaultChannels(
    config.defaultParams,
    (name) => queryParamsFor(matcher, name, urlCache, queryCache),
    method,
  );
}
