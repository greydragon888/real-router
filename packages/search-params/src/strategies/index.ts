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
import { numberStrategies, type NumberStrategy } from "./number";

import type { FinalOptions } from "../types";

// =============================================================================
// Exports
// =============================================================================

export type { ArrayStrategy } from "./array";

export type { BooleanStrategy } from "./boolean";

export type { NullStrategy } from "./null";

export type { NumberStrategy } from "./number";

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
  readonly number: NumberStrategy;
  readonly array: ArrayStrategy;
}

/**
 * Resolves strategies based on format options.
 *
 * @param arrayFormat - Array format
 * @param booleanFormat - Boolean format
 * @param nullFormat - Null format
 * @param numberFormat - Number format
 * @returns Resolved strategy implementations
 */
/**
 * Fail fast on an unknown format. A `queryParams` typo in a JS consumer (no TS to
 * forbid it) otherwise indexes the strategy map to `undefined`, deferring a cryptic
 * `TypeError` to first use — which the router's `SegmentMatcher.#mergeQueryParams`
 * catch-all then masks as `UNKNOWN_ROUTE` for EVERY query URL, with zero diagnostics
 * (#1318). TS consumers are unaffected (the union types already forbid the typo).
 */
const requireStrategy = <T>(
  strategy: T | undefined,
  field: string,
  value: string,
  allowed: string,
): T => {
  if (strategy === undefined) {
    throw new TypeError(
      `[search-params] Unknown ${field} "${value}" — expected ${allowed}`,
    );
  }

  return strategy;
};

export const resolveStrategies = (
  arrayFormat: FinalOptions["arrayFormat"],
  booleanFormat: FinalOptions["booleanFormat"],
  nullFormat: FinalOptions["nullFormat"],
  numberFormat: FinalOptions["numberFormat"],
): ResolvedStrategies => ({
  boolean: requireStrategy(
    booleanStrategies[booleanFormat],
    "booleanFormat",
    booleanFormat,
    '"none" | "auto" | "empty-true"',
  ),
  null: requireStrategy(
    nullStrategies[nullFormat],
    "nullFormat",
    nullFormat,
    '"default" | "hidden"',
  ),
  number: requireStrategy(
    numberStrategies[numberFormat],
    "numberFormat",
    numberFormat,
    '"none" | "auto"',
  ),
  array: requireStrategy(
    arrayStrategies[arrayFormat],
    "arrayFormat",
    arrayFormat,
    '"none" | "brackets" | "index" | "comma"',
  ),
});

// =============================================================================
// Default Strategies
// =============================================================================

/**
 * Default strategies matching DEFAULT_OPTIONS.
 * Used when no custom options are provided.
 */
export const DEFAULT_STRATEGIES: ResolvedStrategies = {
  boolean: booleanStrategies.auto,
  null: nullStrategies.default,
  number: numberStrategies.auto,
  array: arrayStrategies.none,
};
