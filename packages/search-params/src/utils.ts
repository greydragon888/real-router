// packages/route-node/modules/search-params/utils.ts

/**
 * Utility functions for search-params.
 *
 * Internalized from https://github.com/troch/search-params
 *
 * @module search-params/utils
 */

// =============================================================================
// Query String Extraction
// =============================================================================

/**
 * Extracts the query string portion from a path.
 * Returns everything after "?" or the entire string if no "?" exists.
 */
export const getSearch = (path: string): string => {
  const pos = path.indexOf("?");

  // Stryker disable next-line BlockStatement: equivalent — fast path; when there is no "?" (pos === -1) the fallthrough `path.slice(pos + 1)` is `path.slice(0)` === path, identical result (proven by injection). ConditionalExpression stays live (killable `->true` sibling returns the whole path on a "?"-bearing input).
  if (pos === -1) {
    return path;
  }

  return path.slice(pos + 1);
};

// =============================================================================
// Total Percent-Encoding
// =============================================================================

/**
 * Percent-encodes a value, staying TOTAL on a lone (unpaired) surrogate.
 *
 * `encodeURIComponent` throws `URIError` on an unpaired UTF-16 surrogate — the
 * only input it rejects. `parse` accepts such a value (its non-percent decode is
 * an identity fast path), so `build(parse(qs))` would throw and violate the
 * inverse-pair totality invariant `range(parse) ⊆ dom(build)` (INVARIANTS
 * Parse/Build #12). We sanitize the lone surrogate to U+FFFD via `toWellFormed`
 * instead: the first round-trip mutates the (already non-round-trippable) garbage,
 * then stabilises; well-formed inputs are untouched. Single source for BOTH encode
 * sites — scalar/key (`encode.ts`) and array element (`strategies/array.ts`) — so
 * they cannot drift (#1314).
 */
export const safeEncode = (value: string | number | boolean): string => {
  try {
    return encodeURIComponent(value);
  } catch {
    // URIError: lone surrogate → U+FFFD, keeping build total.
    return encodeURIComponent(String(value).toWellFormed());
  }
};
