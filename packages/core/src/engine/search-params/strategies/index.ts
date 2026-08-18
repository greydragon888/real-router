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
  table: Record<string, T>,
  // ⚠ `unknown`, not `string`. The declared type is exactly what this guard
  // cannot trust: a TS consumer is already forbidden the typo by the union, so
  // every value that reaches the throw came from a JS consumer or a
  // runtime-assembled config. Typing it `string` made `String(value)` look like
  // a no-op to the linter, which is the same false confidence in reverse.
  value: unknown,
  field: string,
  allowed: string,
): T => {
  // `Object.hasOwn` on the table, NOT `=== undefined` on a lookup the caller
  // already performed (#1796). These tables are plain object literals indexed by
  // a string the consumer supplies, so for any of `Object.prototype`'s twelve own
  // members the lookup returns a MEMBER instead of `undefined` (eleven of the
  // twelve are functions; `__proto__` yields `Object.prototype` itself, which
  // fails one step later since it carries no `encode` / `encodeArray`): the
  // `undefined` test passed and that member was installed as the live strategy —
  // precisely the deferred
  // `TypeError` this guard exists to prevent, reached through the one value class
  // its predicate could not see.
  //
  // The guard OWNS the lookup for the same reason. A predicate handed the RESULT
  // of someone else's read cannot tell "absent" from "inherited"; asking the
  // container directly is what makes the two inseparable.
  //
  // ⚑ And it owns the KEY, for the same reason once more. Owning the lookup is
  // only half of it: `Object.hasOwn` and the `table[…]` below each run
  // `ToPropertyKey`, so passing the caller's VALUE through both reads it twice.
  // A `{ toString }` answering "none" to the guard and "toString" to the lookup
  // was admitted as one format and used as another, which is the deferred
  // `opts.strategies.array.encodeArray is not a function` this guard exists to
  // prevent — the same defect one layer out from the one it fixed. One
  // coercion, above the check, and verdict and use cannot disagree.
  // ⚠ `typeof` first, not a bare `String(value)`. This runs TWICE per
  // `matchPath` (measured), so it is the hot path until #1819 hoists strategy
  // resolution to matcher construction — and an unconditional coercion measured
  // +3.5% there. For a real string the check returns it untouched; the call
  // happens only for the values this guard exists to refuse.
  const key = typeof value === "string" ? value : String(value);

  // ⚠ One consequence worth naming: a SYMBOL now yields this named error instead
  // of `Cannot convert a Symbol value to a string`. The guard always detected it
  // — `Object.hasOwn` answered `false` — but building the message threw from the
  // template, so the named error never reached the caller for that one class.

  if (!Object.hasOwn(table, key)) {
    throw new TypeError(
      `[search-params] Unknown ${field} "${key}" — expected ${allowed}`,
    );
  }

  return table[key];
};

export const resolveStrategies = (
  arrayFormat: FinalOptions["arrayFormat"],
  booleanFormat: FinalOptions["booleanFormat"],
  nullFormat: FinalOptions["nullFormat"],
  numberFormat: FinalOptions["numberFormat"],
): ResolvedStrategies => ({
  boolean: requireStrategy(
    booleanStrategies,
    booleanFormat,
    "booleanFormat",
    '"none" | "auto" | "empty-true"',
  ),
  null: requireStrategy(
    nullStrategies,
    nullFormat,
    "nullFormat",
    '"default" | "hidden"',
  ),
  number: requireStrategy(
    numberStrategies,
    numberFormat,
    "numberFormat",
    '"none" | "auto"',
  ),
  array: requireStrategy(
    arrayStrategies,
    arrayFormat,
    "arrayFormat",
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
