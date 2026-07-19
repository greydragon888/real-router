/**
 * Utility functions for search-params.
 *
 * Internalized from https://github.com/troch/search-params
 *
 * @module search-params/utils
 */

// =============================================================================
// Total Percent-Encoding
// =============================================================================

/**
 * A lone (unpaired) surrogate — a high surrogate not followed by a low, or a low
 * not preceded by a high. This is a manual, lib-target-agnostic
 * `String.prototype.toWellFormed` (ES2024): consumers compile this `src` under their
 * OWN `tsconfig` (whose `lib` may predate es2024 — e.g. `hash-plugin`), so a regex
 * `replace` avoids a `toWellFormed` type error in every consumer while producing the
 * identical result (verified by parity across the surrogate space).
 */
const LONE_SURROGATE_RGX =
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

/**
 * Percent-encodes a value, staying TOTAL on a lone (unpaired) surrogate.
 *
 * `encodeURIComponent` throws `URIError` on an unpaired UTF-16 surrogate — the
 * only input it rejects. `parseQuery` accepts such a value (its non-percent decode
 * is an identity fast path), so `build(parseQuery(qs))` would throw and violate the
 * inverse-pair totality invariant `range(parseQuery) ⊆ dom(build)` (INVARIANTS
 * Parse/Build #12). We sanitize each lone surrogate to U+FFFD instead: the first
 * round-trip mutates the (already non-round-trippable) garbage, then stabilises;
 * well-formed inputs are untouched. Single source for BOTH encode sites — scalar/key
 * (`encode.ts`) and array element (`strategies/array.ts`) — so they cannot drift
 * (#1314).
 */
export const safeEncode = (value: string | number | boolean): string => {
  try {
    return encodeURIComponent(value);
  } catch (error) {
    // Only a lone surrogate (URIError) is sanitized. Anything else is a real error
    // the caller must see — e.g. a Symbol value throws `TypeError` here, and
    // `String(symbol)` would silently coerce it to "Symbol(…)" instead of rethrowing.
    if (!(error instanceof URIError)) {
      throw error;
    }

    // Lone surrogate → U+FFFD, keeping build total.
    return encodeURIComponent(
      String(value).replaceAll(LONE_SURROGATE_RGX, "�"),
    );
  }
};
