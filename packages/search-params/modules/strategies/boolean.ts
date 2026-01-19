// packages/route-node/modules/search-params/strategies/boolean.ts

/**
 * Boolean encoding/decoding strategies.
 *
 * @module search-params/strategies/boolean
 */

import type { DecodeResult, BooleanFormat } from "../types";

// =============================================================================
// Strategy Map
// =============================================================================

// =============================================================================
// Strategy Interface
// =============================================================================

/**
 * Strategy for encoding/decoding boolean values.
 */
export interface BooleanStrategy {
  /**
   * Encodes a boolean value as a query string segment.
   *
   * @param name - URL-encoded parameter name
   * @param value - Boolean value to encode
   * @returns Query string segment (e.g., "flag=true" or just "flag")
   */
  encode: (name: string, value: boolean) => string;

  /**
   * Handles undefined value (key-only params like ?flag).
   *
   * @returns Decoded value for undefined
   */
  decodeUndefined: () => DecodeResult;

  /**
   * Decodes a raw (not URI-decoded) value before decodeValue() is called.
   * Used for formats that check raw values (e.g., "string" checks "true"/"false").
   *
   * @param rawValue - Raw value before URI decoding
   * @returns boolean if matched, null to continue with URI decoding
   */
  decodeRaw: (rawValue: string) => boolean | null;

  /**
   * Decodes a URI-decoded value.
   *
   * @param decodedValue - Value after URI decoding
   * @returns Decoded value (boolean or the same string)
   */
  decodeValue: (decodedValue: string) => DecodeResult;
}

// =============================================================================
// Strategy Implementations
// =============================================================================

/**
 * No special boolean handling - values are treated as strings.
 */
export const noneBooleanStrategy: BooleanStrategy = {
  encode: (name, value) => `${name}=${value}`,
  decodeUndefined: () => null,
  decodeRaw: () => null, // No raw value matching
  decodeValue: (decoded) => decoded, // Return as-is
};

/**
 * Parse "true"/"false" strings as boolean values.
 * Checks raw value before URI decoding.
 */
export const stringBooleanStrategy: BooleanStrategy = {
  encode: (name, value) => `${name}=${value}`,
  decodeUndefined: () => null,
  decodeRaw: (raw) => {
    if (raw === "true") {
      return true;
    }
    if (raw === "false") {
      return false;
    }

    return null; // Continue with URI decoding
  },
  decodeValue: (decoded) => decoded, // Return decoded string
};

/**
 * True values are key-only (no =value), false values are omitted.
 * Example: ?flag instead of ?flag=true
 */
export const emptyTrueBooleanStrategy: BooleanStrategy = {
  encode: (name, value) => (value ? name : `${name}=false`),
  decodeUndefined: () => true, // Key-only means true
  decodeRaw: () => null, // No raw value matching
  decodeValue: (decoded) => decoded, // Return as-is
};

/**
 * Map of boolean format to strategy implementation.
 */
export const booleanStrategies: Record<BooleanFormat, BooleanStrategy> = {
  none: noneBooleanStrategy,
  string: stringBooleanStrategy,
  "empty-true": emptyTrueBooleanStrategy,
};
