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
 * IMPORTANT: The 'u' (Unicode) flag makes the regex iterate by code point, so a
 * PAIRED surrogate (emoji, outside the BMP) coalesces into one code point that
 * encodeURIComponent accepts. An UNPAIRED (lone) surrogate is itself a single code
 * point that still matches the class and reaches encodeURIComponent, which throws
 * "URI malformed" on it — `encodeURIComponentExcludingSubDelims`'s slow path
 * catches that and sanitizes it to U+FFFD via a lone-surrogate regex, keeping
 * buildPath total (#1315).
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
 * A lone (unpaired) surrogate — a high surrogate not followed by a low, or a low
 * not preceded by a high. A manual, lib-target-agnostic `String.prototype.toWellFormed`
 * (ES2024): consumers compile this `src` under their own `tsconfig` (whose `lib` may
 * predate es2024 — e.g. `hash-plugin`), so a regex `replace` avoids a `toWellFormed`
 * type error there while producing the identical result.
 */
const LONE_SURROGATE_RGX =
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

/**
 * Wraps an encoder so a lone (unpaired) surrogate — the only input
 * `encodeURIComponent` / `encodeURI` reject (`URIError`) — is sanitized to U+FFFD
 * and re-encoded instead of throwing, keeping `buildPath` total (#1315). The
 * surrogate is already non-round-trippable garbage. `path-matcher` has zero deps, so
 * this mirrors search-params' `safeEncode` rather than importing it (a deliberate
 * twin, like the `getTypeDescription` copy in route-tree).
 */
const totalize =
  (encoder: (s: string) => string) =>
  (segment: string): string => {
    try {
      return encoder(segment);
    } catch {
      return encoder(segment.replaceAll(LONE_SURROGATE_RGX, "�"));
    }
  };

// Only the slow path can throw a `URIError` — a lone surrogate always matches
// `NEEDS_ENCODING_REGEX`, so it never reaches the all-safe fast path — hence the
// try/catch sits here and the 29-57x fast path below pays nothing for it.
const encodeSlowPath = totalize((segment: string): string =>
  segment.replaceAll(NEEDS_ENCODING_REGEX, (match) =>
    encodeURIComponent(match),
  ),
);

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
  // Stryker disable next-line BlockStatement: equivalent — pure optimization; `replaceAll(NEEDS_ENCODING_REGEX, ...)` below is a no-op on a string with no encodable chars, so emptying this early return yields the identical value. ConditionalExpression stays live (killable `->true` sibling returns unencoded strings).
  if (!NEEDS_ENCODING_TEST.test(segment)) {
    return segment;
  }

  return encodeSlowPath(segment);
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
  uri: totalize(encodeURI),
  uriComponent: totalize(encodeURIComponent),
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
  // `none` decoding is never reached through `match`: `SegmentMatcher` special-cases
  // `urlParamsEncoding === "none"` to `#decode = null` and skips `#decodeParams`
  // entirely (so a "none" route also skips %-validation — a deliberate behaviour, not
  // merely perf). This identity entry exists only for `Record` type completeness and is
  // exercised by the exempt `tests/property/encoding.properties.ts` round-trip.
  /* v8 ignore next -- unreachable via match (none → null); see the comment above */
  none: (val) => val,
};

// =============================================================================
// Main Encoding Function
// =============================================================================

/**
 * Encodes a SPLAT URL parameter value: each `/`-delimited segment is encoded with the
 * strategy's encoder, preserving the `/` separators.
 *
 * Splat-only by design (#860): a NON-splat param is encoded by `ENCODING_METHODS[encoding]`
 * directly — `registration/buildParts.ts`'s `makeBuildParamSlot` routes only SPLAT slots
 * through here — so the former `!isSpatParam` fast path was unreachable dead code (surfaced
 * by the public-API test migration) and was dropped.
 *
 * @param param - The splat parameter value to encode
 * @param encoding - The encoding strategy to use
 * @returns The encoded splat value (each segment encoded, `/` preserved)
 *
 * @example
 * ```typescript
 * encodeParam('docs/readme.md', 'default');   // => 'docs/readme.md'
 * encodeParam('a/hello world', 'default');    // => 'a/hello%20world'
 * ```
 */
export const encodeParam = (
  param: string | number | boolean,
  encoding: URLParamsEncodingType,
): string => {
  const encoder = ENCODING_METHODS[encoding];
  const str = String(param);

  // Encode each "/"-segment separately, preserving the separators.
  // H6 optimization: string concatenation is 2x faster than template literals
  const segments = str.split("/");
  let result = encoder(segments[0]);

  for (let i = 1; i < segments.length; i++) {
    result += "/" + encoder(segments[i]);
  }

  return result;
};
