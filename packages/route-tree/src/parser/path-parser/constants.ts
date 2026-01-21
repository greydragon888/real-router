// packages/route-node/modules/parser/path-parser/constants.ts

/**
 * Path Parser Constants.
 *
 * Consolidated constants for the path-parser module.
 *
 * @module parser/path-parser/constants
 */

import type { InternalPathOptions, Rule, URLParamsEncodingType } from "./types";

// =============================================================================
// Encoding Constants
// =============================================================================

/**
 * Optimized regex: only matches characters that ACTUALLY need encoding.
 * Excludes:
 * - A-Za-z0-9: alphanumeric (unreserved per RFC 3986)
 * - -._~: unreserved characters per RFC 3986
 * - !$'()*+,:;|: sub-delimiters we want to preserve
 *
 * Performance: This regex skips alphanumeric characters entirely,
 * avoiding unnecessary encodeURIComponent calls that return the same value.
 *
 * IMPORTANT: The 'u' (Unicode) flag is required to handle emoji and other
 * characters outside the Basic Multilingual Plane (BMP). Without it, the regex
 * matches individual UTF-16 code units (surrogates), and encodeURIComponent
 * fails on lone surrogates with "URI malformed" error.
 */
const NEEDS_ENCODING_REGEX = /[^\w!$'()*+,.:;|~-]/gu;

/**
 * Fast check regex (without global flag) to test if encoding is needed at all.
 * Used for pre-check optimization: if string contains only safe chars, skip encoding.
 *
 * IMPORTANT: The 'u' flag ensures proper handling of emoji/surrogate pairs.
 */
const NEEDS_ENCODING_TEST = /[^\w!$'()*+,.:;|~-]/u;

// =============================================================================
// Encoding/Decoding Method Maps
// =============================================================================

/**
 * Encode a segment while preserving sub-delimiters.
 * Uses pre-check optimization: fast path for strings without special chars.
 *
 * Performance improvement over naive approach:
 * - Alphanumeric strings: 29-57x faster
 * - Strings with special chars: 2-3x faster
 */
export const encodeURIComponentExcludingSubDelims = (
  segment: string,
): string => {
  // Fast path: if no special chars, return as-is
  if (!NEEDS_ENCODING_TEST.test(segment)) {
    return segment;
  }

  return segment.replaceAll(NEEDS_ENCODING_REGEX, (match) =>
    encodeURIComponent(match),
  );
};

/**
 * Encoding functions for each encoding type.
 */
export const ENCODING_METHODS: Record<
  URLParamsEncodingType,
  (param: string) => string
> = {
  default: encodeURIComponentExcludingSubDelims,
  uri: encodeURI,
  uriComponent: encodeURIComponent,
  none: (val) => val,
  legacy: encodeURI,
};

/**
 * Decoding functions for each encoding type.
 */
export const DECODING_METHODS: Record<
  URLParamsEncodingType,
  (param: string) => string
> = {
  default: decodeURIComponent,
  uri: decodeURI,
  uriComponent: decodeURIComponent,
  none: (val) => val,
  legacy: decodeURIComponent,
};

// =============================================================================
// Path Defaults
// =============================================================================

/**
 * Default options for Path instances.
 */
export const DEFAULT_PATH_OPTIONS: InternalPathOptions = {
  urlParamsEncoding: "default",
};

// =============================================================================
// Test Pattern Constants
// =============================================================================

/**
 * Regex patterns for Path.test() method.
 * Controls how URL matching handles query strings and end-of-path.
 */
export const TEST_PATTERNS = {
  /** Pattern for URL ending with optional query string: matches "?" followed by anything, or end of string */
  withQueryParams: String.raw`(\?.*$|$)`,
  /** Pattern for URL ending: matches end of string only */
  withoutQueryParams: "$",
} as const;

/**
 * Regex patterns for Path.partialTest() method.
 * Controls delimiter matching for partial URL matching.
 */
export const PARTIAL_TEST_PATTERNS = {
  /** Delimiter pattern: matches /, ?, ., ;, or end of string */
  delimiter: String.raw`([/?.;]|$)`,
} as const;

// =============================================================================
// Tokenizer Rules
// =============================================================================

/**
 * Default regex pattern for URL parameters without constraints.
 */
export const DEFAULT_PARAM_PATTERN = String.raw`[a-zA-Z0-9_.~%':|=+*@$-]+`;

/**
 * Returns the constraint pattern or the default parameter pattern.
 * Wraps the pattern in a capturing group.
 *
 * @param match - The constraint pattern (e.g., "<\\d+>") or empty string
 * @returns Regex pattern string wrapped in parentheses
 *
 * @example
 * ```typescript
 * defaultOrConstrained('<\\d+>');
 * // => '(\\d+)'
 *
 * defaultOrConstrained('');
 * // => '([a-zA-Z0-9-_.~%\':|=+\\*@$]+)'
 * ```
 */
export const defaultOrConstrained = (match: string): string => {
  const pattern = match
    ? match.replaceAll(/(^<|>$)/g, "")
    : DEFAULT_PARAM_PATTERN;

  return `(${pattern})`;
};

/**
 * Tokenization rules for parsing path patterns.
 *
 * Order matters: more specific rules should come first.
 * Each rule defines a pattern to match in the path string and
 * optionally a regex to use for URL matching.
 *
 * @example Path pattern examples:
 * - `/users/:id` - URL parameter
 * - `/users/:id<\\d+>` - Constrained URL parameter
 * - `/files/*path` - Splat parameter (matches rest of path)
 * - `/users/;section` - Matrix parameter
 * - `/users?page&limit` - Query parameters
 */
export const RULES: Rule[] = [
  /**
   * URL Parameter: `:paramName` or `:paramName<constraint>`
   * Matches: :id, :userId, :id<\\d+>
   */
  {
    name: "url-parameter",
    pattern: /^:([\w-]*[\dA-Za-z])(<(.+?)>)?/,
    regex: (match: RegExpMatchArray) =>
      new RegExp(defaultOrConstrained(match[2])),
  },
  /**
   * Splat Parameter: `*paramName`
   * Matches everything up to query string.
   * Example: *path in /files/*path matches "docs/readme.md"
   */
  {
    name: "url-parameter-splat",
    pattern: /^\*([\w-]*[\dA-Za-z])/,
    regex: /([^?]*)/,
  },
  /**
   * Matrix Parameter: `;paramName` or `;paramName<constraint>`
   * RFC 3986 matrix URI syntax.
   * Example: ;section in /users/;section matches ";section=profile"
   */
  {
    name: "url-parameter-matrix",
    pattern: /^;([\w-]*[\dA-Za-z])(<(.+?)>)?/,
    regex: (match: RegExpMatchArray) =>
      new RegExp(`;${match[1]}=${defaultOrConstrained(match[2])}`),
  },
  /**
   * Query Parameter: `?paramName` or `&paramName`
   * Defines expected query string parameters.
   * No regex - query params handled by search-params library.
   */
  {
    name: "query-parameter",
    pattern: /^[&?]:?([\w-]*[\dA-Za-z])/,
  },
  /**
   * Delimiter: `/` or `?`
   * Path segment separators.
   */
  {
    name: "delimiter",
    pattern: /^([/?])/,
    regex: (match: RegExpMatchArray) => new RegExp(`\\${match[0]}`),
  },
  /**
   * Sub-delimiter: `!`, `&`, `.`, `;`, `_`, `-`
   * RFC 3986 sub-delimiters used in paths.
   */
  {
    name: "sub-delimiter",
    pattern: /^([!&.;_-])/,
    regex: (match: RegExpMatchArray) => new RegExp(match[0]),
  },
  /**
   * Fragment: alphanumeric text
   * Static path segments like "users", "posts", "api".
   */
  {
    name: "fragment",
    pattern: /^([\dA-Za-z]+)/,
    regex: (match: RegExpMatchArray) => new RegExp(match[0]),
  },
];
