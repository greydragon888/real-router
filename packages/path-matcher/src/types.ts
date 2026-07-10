// packages/path-matcher/src/types.ts

/**
 * Path Matcher Type Definitions.
 *
 * Core types for path matching and parameter extraction.
 *
 * @module path-matcher/types
 */

// =============================================================================
// Constraint Types
// =============================================================================

/**
 * Constraint pattern for a URL parameter.
 */
export interface ConstraintPattern {
  /**
   * Compiled RegExp for validating the parameter value.
   *
   * @example /^(\d+)$/ for constraint "<\\d+>"
   */
  readonly pattern: RegExp;

  /**
   * Raw constraint string from the route pattern.
   *
   * @example "<\\d+>"
   */
  readonly constraint: string;
}

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
   * Map of parameter names to their constraint patterns.
   *
   * Only includes parameters with explicit constraints (e.g., `:id<\\d+>`).
   * Parameters without constraints are not included in this map.
   *
   * @example
   * ```typescript
   * buildParamMeta("/users/:id<\\d+>").constraintPatterns.get("id")
   * // → { pattern: /^(\d+)$/, constraint: "<\\d+>" }
   *
   * buildParamMeta("/users/:id").constraintPatterns.size
   * // → 0 (no constraints)
   * ```
   */
  readonly constraintPatterns: ReadonlyMap<string, ConstraintPattern>;

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
  readonly constraintPatterns: ReadonlyMap<string, ConstraintPattern>;
  readonly hasConstraints: boolean;

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
  readonly isOptional: boolean;
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

/**
 * Marks a `paramChild` as an OPTIONAL-successor fork (#1263/#1264): the param came
 * from an optional `:opt<constraint>?` directly followed by a dynamic segment, so
 * `match` must disambiguate the omit form. Exactly one field is set:
 *
 * - `constraint` — the optional is followed by a **splat** (`/:v<c>?/*rest`). Take
 *   the segment as the optional only if its DECODED value (#857) satisfies the
 *   constraint (`try-take-if-valid`), else skip and let the splat capture. An
 *   UNCONSTRAINED optional→splat is rejected at registration (reject-with-hint).
 * - `skipName` — the optional is followed by a **required param** (`/:a?/:b`).
 *   On the LAST segment the optional is omitted, so the segment is the successor:
 *   bind it under `skipName` (the successor's name), not the optional's. When the
 *   optional is present (≥2 segments) it binds normally and its constraint (if
 *   any) is validated post-traverse.
 */
export interface ForkMeta {
  readonly constraint?: RegExp | undefined;
  readonly skipName?: string | undefined;
}

export interface SegmentNode {
  /**
   * Starts as the shared frozen `EMPTY_STATIC_CHILDREN` sentinel (pathUtils);
   * `processSegment` copies-on-write to a fresh mutable null-proto object on the
   * first static child — hence not `readonly`. Match reads (`key in …` / index)
   * are correct on the empty sentinel (no key → miss).
   */
  staticChildren: Record<string, SegmentNode>;
  hasChildren: boolean;
  paramChild?:
    | { node: SegmentNode; name: string; fork?: ForkMeta | undefined }
    | undefined;
  splatChild?: { node: SegmentNode; name: string } | undefined;
  route?: CompiledRoute | undefined;
  /**
   * #1153: `true` when `route` was set by a STRONG (full-insertion) terminal write,
   * `false` for a WEAK (optional-omit `??=`) write or when unset. Registration-only
   * — the match hot path never reads it. A second strong write by a DIFFERENT route
   * means two routes share an effective path (a silent-shadow dup); a weak owner is
   * legitimately displaced by a strong write.
   */
  routeIsStrong?: boolean | undefined;
  slashChildRoute?: CompiledRoute | undefined;
}

// =============================================================================
// Match Result Types
// =============================================================================

export interface MatchResult {
  readonly segments: readonly MatcherInputNode[];
  readonly params: Readonly<Record<string, unknown>>;
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
