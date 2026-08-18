/**
 * Matcher Factory.
 *
 * Creates a pre-configured path matcher with search-params DI baked in.
 * This is the public API for creating matchers — SegmentMatcher class
 * and search-params functions are internal implementation details.
 *
 * @module route-tree/createMatcher
 */

import { SegmentMatcher } from "./path-matcher";
import { buildWith, makeOptions, parseQueryWith } from "./search-params";

import type { Options } from "./search-params";

// =============================================================================
// Public Types (route-tree's own — no path-matcher or search-params types leak)
// =============================================================================

/**
 * Query string formatting options.
 *
 * Controls how arrays, booleans, nulls, and numbers are serialized in query strings.
 */
export type QueryParamsConfig = Readonly<Options>;

/**
 * Options for creating a path matcher.
 */
export interface CreateMatcherOptions {
  readonly caseSensitive?: boolean;
  readonly strictTrailingSlash?: boolean;
  readonly strictQueryParams?: boolean;
  readonly urlParamsEncoding?: "default" | "uri" | "uriComponent" | "none";
  readonly queryParams?: QueryParamsConfig;
}

/**
 * Path matcher instance type.
 *
 * Opaque type — consumers use methods (match, buildPath, hasRoute, etc.)
 * without knowing the underlying SegmentMatcher implementation.
 */
export type Matcher = SegmentMatcher;

// =============================================================================
// Factory
// =============================================================================

/**
 * Creates a path matcher with search-params DI baked in.
 *
 * @param options - Matcher configuration
 * @returns Configured matcher instance
 *
 * @example
 * ```typescript
 * const matcher = createMatcher({
 *   strictTrailingSlash: true,
 *   queryParams: { booleanFormat: "auto" },
 * });
 * matcher.registerTree(tree);
 * const result = matcher.match("/users/123");
 * ```
 */
export function createMatcher(options?: CreateMatcherOptions): Matcher {
  const qp = options?.queryParams;

  // Resolve the four query-string strategies ONCE, here, at construction.
  //
  // `resolveStrategies` is what refuses an invalid `queryParams` format, and
  // while it ran per call that refusal arrived from inside `matchPath` — i.e. on
  // the parse path, where `SegmentMatcher`'s `#737` catch used to swallow it into
  // `UNKNOWN_ROUTE` (#1318's own symptom, #1796) and where the URL plugins call
  // from popstate and `navigate`-event handlers that have nobody to catch for
  // them. Hoisting it means a config error surfaces from `createRouter`, named,
  // and `match()` cannot raise one at all.
  //
  // It also makes the refusal unconditional: `parseQuery` and `build` both
  // short-circuit on an empty query before resolving, so a router configured with
  // a bogus format used to run cleanly until the first URL that happened to carry
  // a query key.
  //
  // ⚠ Two input classes stay outside this guard because they never reach
  // `resolveStrategies`: a nullish format value (`makeOptions` coerces it to the
  // default with `??`) and a mis-spelled FIELD (all four known fields read
  // `undefined`, so the cached defaults are returned). Both are silent, and both
  // are `@real-router/validation-plugin`'s to report.
  const queryOptions = makeOptions(qp);

  // Conditional spread: exactOptionalPropertyTypes forbids setting optional
  // properties to undefined — only include properties that are defined.
  return new SegmentMatcher({
    ...(options?.caseSensitive !== undefined && {
      caseSensitive: options.caseSensitive,
    }),
    ...(options?.strictTrailingSlash !== undefined && {
      strictTrailingSlash: options.strictTrailingSlash,
    }),
    ...(options?.strictQueryParams !== undefined && {
      strictQueryParams: options.strictQueryParams,
    }),
    ...(options?.urlParamsEncoding !== undefined && {
      urlParamsEncoding: options.urlParamsEncoding,
    }),
    // qs is ALREADY the query substring (SegmentMatcher split at the first "?");
    // parseQuery parses it verbatim — a path-accepting wrapper would re-split at a
    // "?" inside a query value and drop the param (#1292).
    parseQueryString: (qs: string) => parseQueryWith(qs, queryOptions),
    buildQueryString: (params: Record<string, unknown>) =>
      buildWith(params, queryOptions),
  });
}
