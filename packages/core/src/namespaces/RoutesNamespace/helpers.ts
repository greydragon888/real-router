// packages/core/src/namespaces/RoutesNamespace/helpers.ts

import type { RouteConfig } from "./types";
import type { Route } from "../../types";
import type {
  DefaultDependencies,
  ForwardToCallback,
  Params,
} from "@real-router/types";
import type { RouteDefinition } from "engine";

/**
 * Creates an empty RouteConfig.
 */
export function createEmptyConfig(): RouteConfig {
  return {
    decoders: Object.create(null) as Record<string, (params: Params) => Params>,
    encoders: Object.create(null) as Record<string, (params: Params) => Params>,
    defaultParams: Object.create(null) as Record<string, Params>,
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
    if (source[key] !== target[key]) {
      return false;
    }
  }

  return true;
}

/**
 * Checks params match, skipping keys present in skipKeys.
 */
export function paramsMatchExcluding(
  source: Params,
  target: Params,
  skipKeys: Params,
): boolean {
  for (const key in source) {
    if (key in skipKeys) {
      continue;
    }
    if (source[key] !== target[key]) {
      return false;
    }
  }

  return true;
}

/**
 * Returns a copy of `defaultParams` with query-typed keys removed, based on
 * `ownMeta` (the per-route paramTypeMap from the matcher). When no query keys
 * are present, returns the input by reference (zero-allocation fast path).
 *
 * `ownMeta` may be `undefined` for non-registered route names — this is the
 * caller's escape hatch (e.g. `getMetaByName(name)?.[name]`); a missing meta
 * means no query type information is available, so defaults pass through
 * unchanged.
 */
export function stripQueryDefaults(
  defaultParams: Params,
  ownMeta: Record<string, "url" | "query"> | undefined,
): Params {
  if (!ownMeta || !hasQueryDefault(defaultParams, ownMeta)) {
    return defaultParams;
  }

  const filtered: Params = {};

  for (const key in defaultParams) {
    if (ownMeta[key] !== "query") {
      filtered[key] = defaultParams[key];
    }
  }

  return filtered;
}

function hasQueryDefault(
  defaultParams: Params,
  ownMeta: Record<string, "url" | "query">,
): boolean {
  for (const key in defaultParams) {
    if (ownMeta[key] === "query") {
      return true;
    }
  }

  return false;
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
