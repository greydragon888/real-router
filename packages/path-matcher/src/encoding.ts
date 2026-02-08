// packages/path-matcher/src/encoding.ts

/**
 * URL Parameter Encoding.
 *
 * Encoding strategies for URL parameters.
 *
 * @module encoding
 */

/**
 * Performance-critical code: string concatenation is 2x faster than template
 * literals/String.raw in V8 hot paths. See benchmarks for details.
 */
/* eslint-disable prefer-template */

import type { URLParamsEncodingType } from "./types";

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
// Encoding Helper Functions
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

  /* v8 ignore next 2 */
  return segment.replaceAll(NEEDS_ENCODING_REGEX, (match) =>
    encodeURIComponent(match),
  );
};

// =============================================================================
// Encoding Methods Map
// =============================================================================

/**
 * Encoding functions for each encoding type.
 *
 * Modes:
 * - `default` - encodeURIComponent preserving sub-delimiters (+, :, ', !, ,, ;, *)
 * - `uri` - encodeURI/decodeURI
 * - `uriComponent` - encodeURIComponent/decodeURIComponent
 * - `none` - no encoding/decoding
 */
export const ENCODING_METHODS: Record<
  URLParamsEncodingType,
  (param: string) => string
> = {
  default: encodeURIComponentExcludingSubDelims,
  uri: encodeURI,
  uriComponent: encodeURIComponent,
  /* v8 ignore next */
  none: (val) => val,
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
  /* v8 ignore next */
  none: (val) => val,
};

// =============================================================================
// Main Encoding Function
// =============================================================================

/**
 * Encodes a URL parameter value using the specified encoding strategy.
 *
 * For splat parameters (*path), encodes each path segment separately
 * while preserving "/" characters.
 *
 * @param param - The parameter value to encode
 * @param encoding - The encoding strategy to use
 * @param isSpatParam - Whether this is a splat parameter
 * @returns The encoded parameter string
 *
 * @example
 * ```typescript
 * encodeParam('hello world', 'default', false);
 * // => 'hello%20world'
 *
 * encodeParam('docs/readme.md', 'default', true);
 * // => 'docs/readme.md' (splat preserves slashes)
 * ```
 */
/* v8 ignore start -- exercised by route-tree tests, not path-matcher */
export const encodeParam = (
  param: string | number | boolean,
  encoding: URLParamsEncodingType,
  isSpatParam: boolean,
): string => {
  const encoder = ENCODING_METHODS[encoding];
  const str = String(param);

  if (!isSpatParam) {
    return encoder(str);
  }

  // Splat params: encode each segment separately, preserving "/"
  // H6 optimization: string concatenation is 2x faster than template literals
  const segments = str.split("/");
  let result = encoder(segments[0]);

  for (let i = 1; i < segments.length; i++) {
    result += "/" + encoder(segments[i]);
  }

  return result;
};
/* v8 ignore stop */
