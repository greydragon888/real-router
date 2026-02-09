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

import { SegmentMatcher } from "path-matcher";
import { parse, build } from "search-params";

// =============================================================================
// Public Types (route-tree's own — no path-matcher or search-params types leak)
// =============================================================================

/**
 * Query string formatting options.
 *
 * Controls how arrays, booleans, and nulls are serialized in query strings.
 */
export interface QueryParamsConfig {
  readonly arrayFormat?: "none" | "brackets" | "index" | "comma";
  readonly booleanFormat?: "none" | "string" | "empty-true";
  readonly nullFormat?: "default" | "hidden";
}

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
 *   queryParams: { booleanFormat: "string" },
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
    ...(options?.caseSensitive === undefined
      ? undefined
      : { caseSensitive: options.caseSensitive }),
    ...(options?.strictTrailingSlash === undefined
      ? undefined
      : { strictTrailingSlash: options.strictTrailingSlash }),
    ...(options?.strictQueryParams === undefined
      ? undefined
      : { strictQueryParams: options.strictQueryParams }),
    ...(options?.urlParamsEncoding === undefined
      ? undefined
      : { urlParamsEncoding: options.urlParamsEncoding }),
    parseQueryString: (qs: string) => parse(qs, qp),
    buildQueryString: (params: Record<string, unknown>) => build(params, qp),
  });
}
