// packages/route-node/modules/search-params/decode.ts

/**
 * Decoding functions for search-params.
 *
 * Extracted from encode.ts for better separation of concerns.
 *
 * @module search-params/decode
 */

import type { ResolvedStrategies } from "./strategies";
import type { DecodeResult } from "./types";

// =============================================================================
// Value Decoding
// =============================================================================

/**
 * Decodes a URL-encoded value, handling + as space.
 * Optimized: only replaces + if present, skips decodeURIComponent if not needed.
 *
 * Uses indexOf for checking presence - more mutation-resistant than includes
 * because indexOf("x") returns -1 when not found, while includes("") always returns true.
 */
export const decodeValue = (value: string): string => {
  const percentIdx = value.indexOf("%");
  const plusIdx = value.indexOf("+");

  // Fast path: no encoding needed (common case - most values are simple)
  if (percentIdx === -1 && plusIdx === -1) {
    return value;
  }

  // Only replace + if present (avoid regex overhead)
  const withSpaces = plusIdx === -1 ? value : value.split("+").join(" ");

  // Only decode if % is present
  return percentIdx === -1 ? withSpaces : decodeURIComponent(withSpaces);
};

// =============================================================================
// Main Decode
// =============================================================================

/**
 * Decodes a query parameter value using resolved strategies.
 *
 * @param value - Raw value from query string (undefined for key-only params)
 * @param strategies - Pre-resolved format strategies
 * @returns Decoded value (string, boolean, or null)
 */
export const decode = (
  value: string | undefined,
  strategies: ResolvedStrategies,
): DecodeResult => {
  // Handle undefined (key-only params like ?flag)
  if (value === undefined) {
    return strategies.boolean.decodeUndefined();
  }

  // Check raw value for boolean formats (e.g., "true"/"false")
  const rawResult = strategies.boolean.decodeRaw(value);

  if (rawResult !== null) {
    return rawResult;
  }

  // Decode URI and check decoded value for boolean formats (e.g., ✓/✗)
  const decoded = decodeValue(value);

  return strategies.boolean.decodeValue(decoded);
};
