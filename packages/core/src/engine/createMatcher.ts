// packages/route-tree/src/createMatcher.ts

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
import { parseQuery, build } from "./search-params";

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
    parseQueryString: (qs: string) => parseQuery(qs, qp),
    buildQueryString: (params: Record<string, unknown>) => build(params, qp),
  });
}
