// packages/route-node/modules/parser/path-parser/Path.ts

/**
 * Performance-critical code: string concatenation is 2x faster than template
 * literals/String.raw in V8 hot paths. See benchmarks for details.
 */
/* eslint-disable prefer-template */
/* eslint-disable unicorn/prefer-string-raw */

/**
 * Path Class for URL Routing.
 *
 * Parses, matches, and builds URLs with support for parameters and query strings.
 *
 * @module parser/path-parser/Path
 */

import {
  build as buildQueryParams,
  parse as parseQueryParams,
} from "search-params";

import { buildFromPattern } from "./buildPathFromPattern";
import {
  DEFAULT_PATH_OPTIONS,
  defaultOrConstrained,
  PARTIAL_TEST_PATTERNS,
  TEST_PATTERNS,
} from "./constants";
import { decodeParam, encodeParam } from "./encoding";
import { tokenise } from "./tokeniser";

import type { CompiledPathPattern } from "./buildPathFromPattern";
import type {
  InternalPathOptions,
  ParamValue,
  PathBuildOptions,
  PathOptions,
  PathPartialTestOptions,
  PathTestOptions,
  TestMatch,
  Token,
  URLParamsEncodingType,
} from "./types";
import type { Options } from "search-params";

// =============================================================================
// Types for Regex Cache
// =============================================================================

/**
 * Cached RegExp variations for case-sensitive and case-insensitive matching.
 */
interface RegexVariation {
  /** Case-sensitive regex */
  sensitive: RegExp;
  /** Case-insensitive regex */
  insensitive: RegExp;
}

/**
 * All precompiled regex variations for test() and partialTest().
 * Eliminates RegExp creation on every call (major performance win).
 */
interface RegexCache {
  /** For test() with strictTrailingSlash: false (default) */
  test: RegexVariation;
  /** For test() with strictTrailingSlash: true */
  testStrict: RegexVariation;
  /** For partialTest() with delimited: false */
  partial: RegexVariation;
  /** For partialTest() with delimited: true (default) */
  partialDelimited: RegexVariation;
}

// =============================================================================
// Module-Private Helper Functions
// =============================================================================

/**
 * Checks if a value is defined (not null or undefined).
 */
const isDefined = (val: unknown): boolean => val !== undefined && val !== null;

/**
 * Type guard to check if a value is a primitive parameter value.
 */
const isParamValue = (val: unknown): val is ParamValue =>
  typeof val === "string" ||
  typeof val === "number" ||
  typeof val === "boolean";

/**
 * Type guard to check if a value is encodable (primitive or array of primitives).
 * Filters out null, undefined, and invalid types.
 */
const isEncodableParam = (val: unknown): val is ParamValue | ParamValue[] => {
  if (!isDefined(val)) {
    return false;
  }

  if (isParamValue(val)) {
    return true;
  }

  if (Array.isArray(val)) {
    return val.every((v) => isParamValue(v));
  }

  return false;
};

/**
 * Modifies regex source to make trailing slash optional.
 * Used in test() for flexible URL matching.
 *
 * @param source - Regex source string
 * @returns Modified regex source with optional trailing slash
 */
const optTrailingSlash = (source: string) => {
  if (source === "\\/") {
    return source;
  }

  return source.replace(/\\\/$/, "") + "(?:\\/)?";
};

/**
 * Appends delimiter pattern for partial URL matching.
 * Ensures partial matches stop at path boundaries.
 *
 * @param source - Regex source string
 * @returns Modified regex source with delimiter boundary
 */
const upToDelimiter = (source: string) => {
  return /(\/)$/.test(source)
    ? source
    : source + PARTIAL_TEST_PATTERNS.delimiter;
};

/**
 * Appends a query parameter value to the params object.
 * If param already exists (e.g., from URL param), combines into array.
 *
 * Note: The search-params library already combines duplicate query params,
 * so this is only called once per param key. The array accumulation handles
 * the case where URL param and query param share the same name.
 *
 * @param params - Target params object (mutated)
 * @param param - Parameter name
 * @param val - Parameter value to append
 * @returns The mutated params object
 */
const appendQueryParam = (
  params: Record<string, unknown>,
  param: string,
  val: unknown = "",
): Record<string, unknown> => {
  const existingVal = params[param];

  // Existing value from URL param - combine with query param value
  params[param] = existingVal === undefined ? val : [existingVal, val];

  return params;
};

// =============================================================================
// Path Class
// =============================================================================

/**
 * URL Path parser, matcher, and builder.
 *
 * Supports URL parameters (`:id`), splat parameters (`*path`),
 * matrix parameters (`;section`), query parameters (`?page`),
 * and parameter constraints (`:id<\\d+>`).
 *
 * @template T - Type of extracted/provided parameters object
 *
 * @example
 * ```typescript
 * const path = new Path('/users/:id/posts/:postId');
 *
 * // Match URL and extract params
 * path.test('/users/123/posts/456');
 * // => { id: '123', postId: '456' }
 *
 * // Build URL from params
 * path.build({ id: '123', postId: '456' });
 * // => '/users/123/posts/456'
 * ```
 */
export class Path<T extends Record<string, unknown> = Record<string, unknown>> {
  /** Original path pattern string */
  path: string;

  /** Parsed tokens from the path pattern */
  tokens: Token[];

  /** True if pattern contains any URL parameters (:param, *splat, ;matrix) */
  hasUrlParams: boolean;

  /** True if pattern contains a splat parameter (*path) */
  hasSpatParam: boolean;

  /** True if pattern contains matrix parameters (;param) */
  hasMatrixParams: boolean;

  /** True if pattern contains query parameters (?param) */
  hasQueryParams: boolean;

  /** Merged options with defaults */
  options: InternalPathOptions;

  /** Names of splat parameters in the pattern */
  spatParams: string[];

  /** Names of all URL parameters (including splat and matrix) */
  urlParams: string[];

  /** Names of query parameters in the pattern */
  queryParams: string[];

  /** Names of all parameters (URL + query) */
  params: string[];

  /** Compiled regex source for URL matching */
  source: string;

  /**
   * Precompiled regex cache for test() and partialTest().
   * Eliminates RegExp creation overhead in hot paths.
   */
  private readonly regexCache: RegexCache;

  /**
   * Precompiled constraint patterns for build() validation.
   * Maps parameter name to { pattern: RegExp, constraint: original constraint string }.
   */
  private readonly constraintPatterns: Map<
    string,
    { pattern: RegExp; constraint: string }
  >;

  /**
   * Cached options for build() when no overrides are provided.
   * Eliminates object creation overhead in hot paths.
   */
  private readonly buildOptionsCache: {
    readonly ignoreConstraints: false;
    readonly ignoreSearch: false;
    readonly queryParams: Options;
    readonly urlParamsEncoding: URLParamsEncodingType;
  };

  // ===========================================================================
  // R4 Optimization: Pre-compiled Build Pattern
  // ===========================================================================

  /**
   * Pre-compiled pattern for fast path building.
   * Used by buildFromPattern() for O(n) path construction without token iteration.
   */
  private readonly compiledBuildPattern: CompiledPathPattern;

  /**
   * Creates a new Path instance.
   *
   * @param path - Path pattern to parse (e.g., '/users/:id?page')
   * @param options - Optional configuration for encoding and query params
   * @throws Error if path is empty
   *
   * @example
   * ```typescript
   * // Simple path with URL param
   * new Path('/users/:id');
   *
   * // With constraint
   * new Path('/users/:id<\\d+>');
   *
   * // With query params
   * new Path('/users/:id?page&limit');
   *
   * // With encoding options
   * new Path('/users/:id', { urlParamsEncoding: 'uriComponent' });
   * ```
   */
  constructor(path: string, options?: PathOptions) {
    if (!path) {
      throw new Error("Missing path in Path constructor");
    }

    this.path = path;
    this.options = {
      ...DEFAULT_PATH_OPTIONS,
      ...options,
    };
    this.tokens = tokenise(path);

    this.hasUrlParams = this.tokens.some((t) =>
      t.type.startsWith("url-parameter"),
    );
    this.hasSpatParam = this.tokens.some((t) => t.type.endsWith("splat"));
    this.hasMatrixParams = this.tokens.some((t) => t.type.endsWith("matrix"));
    this.hasQueryParams = this.tokens.some((t) =>
      t.type.startsWith("query-parameter"),
    );

    // Extract named parameters from tokens
    this.spatParams = this.getParams("url-parameter-splat");
    this.urlParams = this.getParams(/^url-parameter/);
    // Query params
    this.queryParams = this.getParams("query-parameter");
    // All params
    this.params = [...this.urlParams, ...this.queryParams];

    // Regular expressions for url part only (full and partial match)
    let source = "";

    for (const t of this.tokens) {
      if (t.regex !== undefined) {
        source += t.regex.source;
      }
    }

    this.source = source;

    // Precompile all regex variations
    // Eliminates RegExp creation on every test()/partialTest() call
    const testSource = optTrailingSlash(source);
    const testStrictSource = source;
    const partialSource = source;
    const partialDelimitedSource = upToDelimiter(source);

    const testSuffix = this.hasQueryParams
      ? TEST_PATTERNS.withQueryParams
      : TEST_PATTERNS.withoutQueryParams;

    this.regexCache = {
      test: {
        sensitive: new RegExp("^" + testSource + testSuffix),
        insensitive: new RegExp("^" + testSource + testSuffix, "i"),
      },
      testStrict: {
        sensitive: new RegExp("^" + testStrictSource + testSuffix),
        insensitive: new RegExp("^" + testStrictSource + testSuffix, "i"),
      },
      partial: {
        sensitive: new RegExp("^" + partialSource),
        insensitive: new RegExp("^" + partialSource, "i"),
      },
      partialDelimited: {
        sensitive: new RegExp("^" + partialDelimitedSource),
        insensitive: new RegExp("^" + partialDelimitedSource, "i"),
      },
    };

    // Precompile constraint patterns for build() validation
    this.constraintPatterns = new Map();
    const constrainedTokens = this.tokens.filter(
      (t) => t.type.startsWith("url-parameter") && !t.type.endsWith("-splat"),
    );

    for (const t of constrainedTokens) {
      const paramName = t.val[0];
      const constraintStr = t.otherVal[0]; // e.g., "<\\d+>" or ""
      const pattern = new RegExp(
        "^" + defaultOrConstrained(constraintStr) + "$",
      );

      this.constraintPatterns.set(paramName, {
        pattern,
        constraint: constraintStr,
      });
    }

    // Pre-compute build options cache to avoid object creation in build()
    this.buildOptionsCache = {
      ignoreConstraints: false,
      ignoreSearch: false,
      queryParams: this.options.queryParams ?? {},
      urlParamsEncoding: this.options.urlParamsEncoding,
    };

    // R4 Optimization: Pre-compile build pattern for fast path construction
    // Filter out query parameters at parse time
    const buildTokens = this.tokens.filter(
      (t) => !t.type.startsWith("query-parameter"),
    );

    // Pre-compute static parts and param names for interleaved building
    const staticParts: string[] = [];
    const paramNames: string[] = [];
    let currentStatic = "";

    for (const t of buildTokens) {
      if (
        t.type.startsWith("url-parameter") &&
        t.type !== "url-parameter-matrix"
      ) {
        // Save accumulated static, then add param
        staticParts.push(currentStatic);
        currentStatic = "";
        paramNames.push(t.val[0]);
      } else if (t.type === "url-parameter-matrix") {
        // Matrix params need special handling - accumulate prefix
        currentStatic += ";" + t.val[0] + "=";
        staticParts.push(currentStatic);
        currentStatic = "";
        paramNames.push(t.val[0]);
      } else {
        // Static content (delimiter, fragment, sub-delimiter)
        currentStatic += t.match;
      }
    }

    // Add trailing static (may be empty)
    staticParts.push(currentStatic);

    this.compiledBuildPattern = {
      staticParts,
      paramNames,
      pattern: path,
    };
  }

  /**
   * Factory method to create a Path instance.
   * Alternative to using `new Path()` directly.
   *
   * @param path - Path pattern to parse
   * @param options - Optional configuration
   * @returns New Path instance
   */
  static createPath<
    T extends Record<string, unknown> = Record<string, unknown>,
  >(path: string, options?: PathOptions): Path<T> {
    return new Path<T>(path, options);
  }

  /**
   * Checks if a parameter name is a query parameter.
   *
   * @param name - Parameter name to check
   * @returns True if the parameter is defined in query string
   */
  isQueryParam(name: string): boolean {
    return this.queryParams.includes(name);
  }

  /**
   * Checks if a parameter name is a splat parameter.
   *
   * @param name - Parameter name to check
   * @returns True if the parameter is a splat (*path)
   */
  isSpatParam(name: string): boolean {
    return this.spatParams.includes(name);
  }

  /**
   * Tests if a URL exactly matches this path pattern.
   * Extracts parameter values from matching URLs.
   *
   * This is the HOT PATH for leaf node matching in route trees.
   *
   * @param path - URL to test against the pattern
   * @param opts - Test options (case sensitivity, trailing slash handling)
   * @returns Extracted parameters object, or null if no match
   *
   * @example
   * ```typescript
   * const pattern = new Path('/users/:id');
   *
   * pattern.test('/users/123');
   * // => { id: '123' }
   *
   * pattern.test('/users/123/posts');
   * // => null (not exact match)
   *
   * pattern.test('/USERS/123');
   * // => { id: '123' } (case insensitive by default)
   *
   * pattern.test('/USERS/123', { caseSensitive: true });
   * // => null
   * ```
   */
  test(path: string, opts?: PathTestOptions): TestMatch<T> {
    // Direct property access avoids object spread overhead
    const caseSensitive = opts?.caseSensitive ?? false;
    const strictTrailingSlash = opts?.strictTrailingSlash ?? false;

    // Use precompiled regex instead of creating on every call
    const regexVariation = strictTrailingSlash
      ? this.regexCache.testStrict
      : this.regexCache.test;
    const regex = caseSensitive
      ? regexVariation.sensitive
      : regexVariation.insensitive;

    const match = this.urlTestWithRegex(
      path,
      regex,
      opts?.urlParamsEncoding ?? this.options.urlParamsEncoding,
    );

    // If no match, or no query params, no need to go further
    if (!match || !this.hasQueryParams) {
      return match;
    }

    // Extract query params
    const queryParams = parseQueryParams(
      path,
      opts?.queryParams ?? this.options.queryParams,
    );

    // Single pass: check for unexpected params AND copy in one loop
    // Avoids Object.keys() allocation and double iteration
    let hasUnexpected = false;

    for (const p in queryParams) {
      if (this.isQueryParam(p)) {
        (match as Record<string, unknown>)[p] = queryParams[p];
      } else {
        hasUnexpected = true;
      }
    }

    return hasUnexpected ? null : match;
  }

  /**
   * Tests if a URL starts with this path pattern.
   * Used for matching branch nodes in route trees.
   *
   * This is the HOT PATH for branch node matching in route trees.
   *
   * @param path - URL to test against the pattern
   * @param opts - Test options (case sensitivity, delimiter handling)
   * @returns Extracted parameters object, or null if no match
   *
   * @example
   * ```typescript
   * const pattern = new Path('/users/:id');
   *
   * pattern.partialTest('/users/123/posts/456');
   * // => { id: '123' } (matches prefix)
   *
   * pattern.partialTest('/users/123');
   * // => { id: '123' }
   *
   * pattern.partialTest('/posts/123');
   * // => null
   * ```
   */
  partialTest(path: string, opts?: PathPartialTestOptions): TestMatch<T> {
    // Direct property access avoids object spread overhead
    const caseSensitive = opts?.caseSensitive ?? false;
    const delimited = opts?.delimited ?? true;

    // Use precompiled regex instead of creating on every call
    const regexVariation = delimited
      ? this.regexCache.partialDelimited
      : this.regexCache.partial;
    const regex = caseSensitive
      ? regexVariation.sensitive
      : regexVariation.insensitive;

    const match = this.urlTestWithRegex(
      path,
      regex,
      opts?.urlParamsEncoding ?? this.options.urlParamsEncoding,
    );

    if (!match) {
      return match;
    }

    if (!this.hasQueryParams) {
      return match;
    }

    const queryParams = parseQueryParams(
      path,
      opts?.queryParams ?? this.options.queryParams,
    );

    // for-in is faster than Object.keys() iteration
    for (const p in queryParams) {
      if (this.isQueryParam(p)) {
        appendQueryParam(match as Record<string, unknown>, p, queryParams[p]);
      }
    }

    return match;
  }

  /**
   * Builds a URL from parameter values.
   * Encodes parameters and validates constraints.
   *
   * @param params - Parameter values to substitute into the pattern
   * @param opts - Build options (constraint validation, query string handling)
   * @returns Constructed URL string
   * @throws Error if required parameters are missing
   * @throws Error if parameters violate constraints (unless ignoreConstraints)
   *
   * @example
   * ```typescript
   * const pattern = new Path('/users/:id/posts/:postId?page');
   *
   * pattern.build({ id: '123', postId: '456' });
   * // => '/users/123/posts/456'
   *
   * pattern.build({ id: '123', postId: '456', page: '1' });
   * // => '/users/123/posts/456?page=1'
   *
   * pattern.build({ id: '123' });
   * // => Error: requires missing parameters { postId }
   * ```
   */
  build(params: T = {} as T, opts?: PathBuildOptions): string {
    // Use cached options when no overrides, avoiding object creation
    const options = opts
      ? {
          ignoreConstraints: opts.ignoreConstraints ?? false,
          ignoreSearch: opts.ignoreSearch ?? false,
          queryParams: opts.queryParams ?? this.buildOptionsCache.queryParams,
          urlParamsEncoding:
            opts.urlParamsEncoding ?? this.buildOptionsCache.urlParamsEncoding,
        }
      : this.buildOptionsCache;

    const encodedUrlParams = this.encodeUrlParams(
      params,
      options.urlParamsEncoding,
    );

    this.validateRequiredParams(params);

    if (!options.ignoreConstraints) {
      this.validateConstraints(encodedUrlParams);
    }

    const base = this.buildBasePath(encodedUrlParams);

    if (options.ignoreSearch) {
      return base;
    }

    return this.buildWithSearch(base, params, options.queryParams);
  }

  // ===========================================================================
  // Private Methods - Encoding
  // ===========================================================================

  /**
   * Encodes all URL parameters from the input params object.
   * Skips query parameters (handled separately by search-params).
   *
   * @param params - Raw parameter values
   * @param encoding - Encoding strategy to use
   * @returns Object with encoded parameter values
   */
  private encodeUrlParams(
    params: T,
    encoding: URLParamsEncodingType,
  ): Record<string, unknown> {
    const encoded: Record<string, unknown> = {};

    for (const key of Object.keys(params)) {
      if (this.isQueryParam(key)) {
        continue;
      }

      const val = params[key];

      if (!isEncodableParam(val)) {
        continue;
      }

      encoded[key] = this.encodeParamValue(val, key, encoding);
    }

    return encoded;
  }

  /**
   * Encodes a single parameter value.
   * Handles booleans, arrays, and primitive values.
   *
   * @param val - Value to encode (already validated by isEncodableParam)
   * @param key - Parameter name (to check if splat)
   * @param encoding - Encoding strategy to use
   * @returns Encoded value (string, boolean, or array)
   */
  private encodeParamValue(
    val: ParamValue | ParamValue[],
    key: string,
    encoding: URLParamsEncodingType,
  ): unknown {
    if (typeof val === "boolean") {
      return val;
    }

    const isSpatParam = this.isSpatParam(key);

    if (Array.isArray(val)) {
      return val.map((v) => encodeParam(v, encoding, isSpatParam));
    }

    return encodeParam(val, encoding, isSpatParam);
  }

  // ===========================================================================
  // Private Methods - Validation
  // ===========================================================================

  /**
   * Validates that all required URL parameters are present.
   *
   * @param params - Parameters to validate
   * @throws Error listing missing required parameters
   */
  private validateRequiredParams(params: T): void {
    const missingParameters = this.urlParams.filter(
      (p) => !isDefined(params[p]),
    );

    if (missingParameters.length > 0) {
      throw new Error(
        "Cannot build path: '" +
          this.path +
          "' requires missing parameters { " +
          missingParameters.join(", ") +
          " }",
      );
    }
  }

  /**
   * Validates that encoded parameter values match their constraints.
   * Uses precompiled constraint patterns.
   *
   * @param encodedUrlParams - Already encoded parameter values
   * @throws Error if any parameter violates its constraint
   */
  private validateConstraints(encodedUrlParams: Record<string, unknown>): void {
    // Use precompiled constraint patterns
    for (const [paramName, { pattern, constraint }] of this
      .constraintPatterns) {
      const value = String(encodedUrlParams[paramName]);

      if (!pattern.test(value)) {
        // Extract constraint pattern without angle brackets for cleaner message
        // If no explicit constraint, show the default pattern description
        const constraintPattern = constraint
          ? constraint.replaceAll(/(^<)|(>$)/g, "")
          : "[^/]+";

        throw new Error(
          `Parameter '${paramName}' of '${this.path}' has invalid format: ` +
            `got '${value}', expected to match '${constraintPattern}'`,
        );
      }
    }
  }

  // ===========================================================================
  // Private Methods - URL Building
  // ===========================================================================

  /**
   * Builds the base URL path (without query string).
   * Uses buildFromPattern with pre-compiled pattern for O(n) construction.
   * R4 Optimization: 3x faster than token iteration.
   *
   * @param encodedUrlParams - Encoded parameter values
   * @returns Built URL path string
   */
  private buildBasePath(encodedUrlParams: Record<string, unknown>): string {
    return buildFromPattern(this.compiledBuildPattern, encodedUrlParams);
  }

  /**
   * Appends query string to the base path.
   * Uses search-params library for query string formatting.
   *
   * @param base - Base URL path
   * @param params - All parameters (filters to query params only)
   * @param queryParamsOptions - Formatting options for search-params
   * @returns Complete URL with query string (if any)
   */
  private buildWithSearch(
    base: string,
    params: T,
    queryParamsOptions: Options | undefined,
  ): string {
    const searchParams: Record<string, unknown> = {};

    // 'in' operator is O(1) vs Object.keys().includes() which is O(n²)
    for (const paramName of this.queryParams) {
      if (paramName in params) {
        searchParams[paramName] = params[paramName];
      }
    }

    const searchPart = buildQueryParams(searchParams, queryParamsOptions);

    return searchPart ? base + "?" + searchPart : base;
  }

  // ===========================================================================
  // Private Methods - Utilities
  // ===========================================================================

  /**
   * Extracts parameter names from tokens by type.
   * Single pass instead of filter + map.
   *
   * @param type - Token type to filter (string for exact match, RegExp for pattern)
   * @returns Array of parameter names
   */
  private getParams(type: string | RegExp): string[] {
    const result: string[] = [];
    const isRegex = type instanceof RegExp;

    for (const t of this.tokens) {
      if (isRegex ? type.test(t.type) : t.type === type) {
        result.push(t.val[0]);
      }
    }

    return result;
  }

  /**
   * Core regex matching logic for test() and partialTest().
   * Uses precompiled regex and extracts parameter values.
   *
   * @param path - URL to test
   * @param regex - Precompiled RegExp to use for matching
   * @param urlParamsEncoding - Decoding strategy for extracted values
   * @returns Extracted parameters object, or null if no match
   */
  private urlTestWithRegex(
    path: string,
    regex: RegExp,
    urlParamsEncoding: URLParamsEncodingType,
  ): TestMatch<T> {
    const match = regex.exec(path);

    if (!match) {
      return null;
    }

    if (this.urlParams.length === 0) {
      return {} as T;
    }

    // Reduce named params to key-value pairs
    const result: Record<string, unknown> = {};

    for (let i = 0; i < this.urlParams.length; i++) {
      result[this.urlParams[i]] = decodeParam(match[i + 1], urlParamsEncoding);
    }

    return result as T;
  }
}
