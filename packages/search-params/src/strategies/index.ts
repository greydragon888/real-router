// packages/route-node/modules/search-params/strategies/index.ts

/**
 * Search Params Strategies - Factory and Types.
 *
 * Provides a unified interface for format-specific encoding/decoding strategies.
 * Strategies are resolved once when options are created, avoiding repeated
 * format checks during encode/decode operations.
 *
 * @module search-params/strategies
 */

import { arrayStrategies, type ArrayStrategy } from "./array";
import { booleanStrategies, type BooleanStrategy } from "./boolean";
import { nullStrategies, type NullStrategy } from "./null";

import type { FinalOptions } from "../types";

// =============================================================================
// Exports
// =============================================================================

export type { ArrayStrategy } from "./array";

export type { BooleanStrategy } from "./boolean";

export type { NullStrategy } from "./null";

// =============================================================================
// Resolved Strategies
// =============================================================================

/**
 * Pre-resolved strategies based on options.
 * Created once when makeOptions() is called, avoiding repeated lookups.
 */
export interface ResolvedStrategies {
  readonly boolean: BooleanStrategy;
  readonly null: NullStrategy;
  readonly array: ArrayStrategy;
}

/**
 * Resolves strategies based on format options.
 *
 * @param arrayFormat - Array format
 * @param booleanFormat - Boolean format
 * @param nullFormat - Null format
 * @returns Resolved strategy implementations
 */
export const resolveStrategies = (
  arrayFormat: FinalOptions["arrayFormat"],
  booleanFormat: FinalOptions["booleanFormat"],
  nullFormat: FinalOptions["nullFormat"],
): ResolvedStrategies => ({
  boolean: booleanStrategies[booleanFormat],
  null: nullStrategies[nullFormat],
  array: arrayStrategies[arrayFormat],
});

// =============================================================================
// Default Strategies
// =============================================================================

/**
 * Default strategies matching DEFAULT_OPTIONS.
 * Used when no custom options are provided.
 */
export const DEFAULT_STRATEGIES: ResolvedStrategies = {
  boolean: booleanStrategies.none,
  null: nullStrategies.default,
  array: arrayStrategies.none,
};
