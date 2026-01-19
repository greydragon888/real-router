// packages/route-node/modules/search-params/strategies/null.ts

/**
 * Null encoding/decoding strategies.
 *
 * @module search-params/strategies/null
 */

// =============================================================================
// Strategy Interface
// =============================================================================

/**
 * Strategy for encoding/decoding null values.
 */
// =============================================================================
// Strategy Map
// =============================================================================

import type { NullFormat } from "../types";

export interface NullStrategy {
  /**
   * Encodes a null value as a query string segment.
   *
   * @param name - URL-encoded parameter name
   * @returns Query string segment (e.g., "key" or "")
   */
  encode: (name: string) => string;
}

// =============================================================================
// Strategy Implementations
// =============================================================================

/**
 * Default null format - key only without value.
 * Example: ?key (no equals sign)
 */
export const defaultNullStrategy: NullStrategy = {
  encode: (name) => name,
};

/**
 * Null values are hidden (omitted from query string).
 * Example: (nothing)
 */
export const hiddenNullStrategy: NullStrategy = {
  encode: () => "",
};

/**
 * Map of null format to strategy implementation.
 */
export const nullStrategies: Record<NullFormat, NullStrategy> = {
  default: defaultNullStrategy,
  hidden: hiddenNullStrategy,
};
