/**
 * Path Matcher Type Definitions.
 *
 * Core types for path matching and parameter extraction.
 *
 * @module path-matcher/types
 */

/**
 * Parameter metadata extracted from a route path pattern.
 */
export interface ParamMeta {
  /**
   * URL parameter names extracted from the path pattern.
   *
   * @example [":id", ":postId"] from "/users/:id/posts/:postId"
   */
  readonly urlParams: readonly string[];

  /**
   * Query parameter names extracted from the path pattern.
   *
   * @example ["q", "page"] from "/search?q&page"
   */
  readonly queryParams: readonly string[];

  /**
   * Splat parameter names extracted from the path pattern.
   *
   * @example ["path"] from "/files/*path"
   */
  readonly spatParams: readonly string[];

  /**
   * Map of parameter names to their type (url or query).
   *
   * @example { id: "url", q: "query" }
   */
  readonly paramTypeMap: Readonly<Record<string, "url" | "query">>;

  /**
   * Path pattern without query string, pre-computed for buildPath.
   *
   * @example "/users/:id" from "/users/:id?q&page"
   */
  readonly pathPattern: string;
}

// =============================================================================
// Encoding Types
// =============================================================================

/**
 * URL parameter encoding strategies.
 *
 * - `default` - encodeURIComponent preserving sub-delimiters (+, :, ', !, ,, ;, *)
 * - `uri` - encodeURI/decodeURI
 * - `uriComponent` - encodeURIComponent/decodeURIComponent
 * - `none` - no encoding/decoding
 */
export type URLParamsEncodingType = "default" | "uri" | "uriComponent" | "none";

// =============================================================================
// Matcher Input Types
// =============================================================================

export interface MatcherInputNode {
  readonly name: string;
  readonly path: string;
  readonly fullName: string;
  readonly absolute: boolean;
  readonly children: ReadonlyMap<string, MatcherInputNode>;
  readonly nonAbsoluteChildren: readonly MatcherInputNode[];
  readonly paramMeta: ParamMeta;
  readonly paramTypeMap: Readonly<Record<string, "url" | "query">>;
}

// =============================================================================
// Compiled Route Types
// =============================================================================

export interface CompiledRoute {
  readonly name: string;

  readonly parent: CompiledRoute | null;

  readonly matchSegments: readonly MatcherInputNode[];
  readonly meta: Readonly<Record<string, Record<string, "url" | "query">>>;
  readonly declaredQueryParams: readonly string[];
  readonly declaredQueryParamsSet: ReadonlySet<string>;
  readonly hasTrailingSlash: boolean;

  readonly buildStaticParts: readonly string[];
  readonly buildParamSlots: readonly BuildParamSlot[];
  readonly buildParamNamesSet: ReadonlySet<string>;

  // Required (not optional) so every CompiledRoute literal initializes it — a
  // static route sets the cached result, a param route leaves it `undefined`,
  // but both share ONE hidden class (an optional added post-construction made
  // the two megamorphic). #1009
  cachedResult: MatchResult | undefined;
}

export interface BuildParamSlot {
  readonly paramName: string;
  readonly encoder: (value: string) => string;
}

/**
 * Per-call options for buildPath.
 */
export interface BuildPathOptions {
  readonly queryParamsMode?: "default" | "strict" | "loose" | undefined;
  readonly trailingSlash?: "default" | "always" | "never" | undefined;
}

// =============================================================================
// Segment Trie Types
// =============================================================================

export interface SegmentNode {
  /**
   * Starts as the shared frozen `EMPTY_STATIC_CHILDREN` sentinel (pathUtils);
   * `processSegment` copies-on-write to a fresh mutable null-proto object on the
   * first static child — hence not `readonly`. Match reads (`key in …` / index)
   * are correct on the empty sentinel (no key → miss).
   */
  staticChildren: Record<string, SegmentNode>;
  hasChildren: boolean;
  paramChild?: { node: SegmentNode; name: string } | undefined;
  splatChild?: { node: SegmentNode; name: string } | undefined;
  route?: CompiledRoute | undefined;
  slashChildRoute?: CompiledRoute | undefined;
}

// =============================================================================
// Match Result Types
// =============================================================================

export interface MatchResult {
  readonly segments: readonly MatcherInputNode[];
  /** PATH params (query still folded in for A2 back-compat, RFC-4 M2 / #1548). */
  readonly params: Readonly<Record<string, unknown>>;
  /** QUERY params — the query channel; frozen `{}` when no query string. */
  readonly search: Readonly<Record<string, unknown>>;
  readonly meta: Readonly<Record<string, Record<string, "url" | "query">>>;
}

// =============================================================================
// Matcher Options Types
// =============================================================================

export interface SegmentMatcherOptions {
  caseSensitive?: boolean;
  strictTrailingSlash?: boolean;
  strictQueryParams?: boolean;
  urlParamsEncoding?: URLParamsEncodingType;
  parseQueryString: (queryString: string) => Record<string, unknown>;
  buildQueryString: (params: Record<string, unknown>) => string;
}

export interface ResolvedMatcherOptions {
  readonly caseSensitive: boolean;
  readonly strictTrailingSlash: boolean;
  readonly strictQueryParams: boolean;
  readonly urlParamsEncoding: URLParamsEncodingType;
  readonly parseQueryString: (queryString: string) => Record<string, unknown>;
  readonly buildQueryString: (params: Record<string, unknown>) => string;
}
