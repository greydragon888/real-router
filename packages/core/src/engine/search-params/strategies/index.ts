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

/**
 * Intrinsics captured at module load: `defineProperty`, `objectKeys`, `hasOwn`.
 *
 * ⚑ A guard is only as strong as the intrinsic it reads WHEN IT RUNS, and an
 * application can re-point any of these AFTER boot — which is what this closes.
 * Measured on the uncaptured form: one naive `Object.hasOwn` polyfill walked
 * straight through five sibling readers while the single captured guard held.
 *
 * ⚠ It does NOT close a shim evaluated BEFORE this module — the ordinary
 * polyfill order. Measured: a naive `Object.hasOwn` imported ahead of core
 * reproduces #1798 verbatim (`buildPath` prints the native method into the
 * URL).
 */
const defineProperty = Object.defineProperty;
const objectKeys = Object.keys;
const hasOwn = Object.hasOwn;
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
 * `Object.hasOwn`, captured before any application code can run.
 *
 * ⚑ This is the RAISER of the config fault `SegmentMatcher`'s predicate exists
 * to recognise, so leaving it reading the mutable global made hardening that
 * predicate pointless: measured, `Object.hasOwn = () => true` after boot let an
 * invalid format through `createRouter` and every query URL then resolved to
 * `UNKNOWN_ROUTE` — the #1318 symptom, restored.
 */

export const CONFIG_FAULT: unique symbol = Symbol.for(
  "real-router.searchParams.configFault",
);

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
  // ⚠ `typeof` first, not a bare `String(value)` — and NOT as a hot-path term.
  // Resolution happens at matcher construction, four calls per ROUTER, not
  // twice per `matchPath` where an unconditional coercion measured +3.5 %. It
  // stays because for a real string it returns the value untouched,
  // which is simply the honest shape, and because the coercion is reserved for
  // exactly the values this guard exists to refuse.
  const key = typeof value === "string" ? value : String(value);

  // ⚠ One consequence worth naming: a SYMBOL now yields this named error instead
  // of `Cannot convert a Symbol value to a string`. The guard always detected it
  // — `Object.hasOwn` answered `false` — but building the message threw from the
  // template, so the named error never reached the caller for that one class.

  // ⚑ `[router.constructor]`, and the option's FULL PATH. A `[search-params]`
  // prefix names a layer that is not a package (#1510) and that the caller never
  // wrote; pairing it with the bare field points at neither a thing the user
  // typed nor a thing they could look up.
  //
  // ⚑ The prefix is `[router.constructor]` and not an invented
  // `[router.options]`, on two counts. Core has ELEVEN `[router.*]` prefixes and
  // every one of them names the CALL the user made, so a namespace there would
  // be the only exception. And `@real-router/validation-plugin` prints
  // `[router.constructor] Invalid "queryParams.<key>"` for this exact option —
  // agreeing with it is the whole point, since the hoist makes the plugin's
  // message unreachable for these four fields.
  //
  // ⚠ A first attempt rejected `[router.constructor]` as "false on most of its
  // doors, since the hoist runs this from `cloneRouter` and every matcher
  // rebuild". Refuted by measurement, and by a SIBLING commit in the same
  // change: the snapshot and its container are both frozen, so a rebuild has
  // nothing left that can fail, and `cloneRouter` raises through
  // `new RouterClass(...)`. Both doors that can raise ARE the constructor.
  if (!hasOwn(table, key)) {
    const error = new TypeError(
      `[router.constructor] Invalid "queryParams.${field}": "${key}" — expected ${objectKeys(
        table,
      )
        .map((name) => `"${name}"`)
        .join(" | ")}`,
    );

    // ⚑ TAGGED, because the parse catch must recognise this by ORIGIN and not by
    // class. `match()` must never throw on INPUT, and the catch around the parse
    // is that contract's backstop; narrowing it to "rethrow anything that is not
    // a `URIError`" inverted the default from fail-safe to fail-open, and the
    // enumeration of throwers behind that inversion was incomplete. `assignParam`
    // writes `params[name] = value` with the name taken from the URL, so an
    // application setter on `Object.prototype` for that name runs inside the
    // guarded `try`, and its error is neither a `URIError` nor ours. Measured: a
    // throwing setter for a key a URL supplies propagated out of `matchPath` —
    // into the popstate handlers of the three URL plugins and `preload-plugin`'s
    // hover path, none of which catch.
    //
    // A marker on OUR error lets the catch rethrow exactly what it means to
    // rethrow — the config fault #1796 refuses to swallow — and go on swallowing
    // everything else, which is what the contract says. A property rather than a
    // subclass: the message and the `TypeError` identity are what consumers see,
    // and neither moves.
    defineProperty(error, CONFIG_FAULT, { value: true });

    throw error;
  }

  return table[key];
};

export const resolveStrategies = (
  arrayFormat: FinalOptions["arrayFormat"],
  booleanFormat: FinalOptions["booleanFormat"],
  nullFormat: FinalOptions["nullFormat"],
  numberFormat: FinalOptions["numberFormat"],
): ResolvedStrategies => ({
  boolean: requireStrategy(booleanStrategies, booleanFormat, "booleanFormat"),
  null: requireStrategy(nullStrategies, nullFormat, "nullFormat"),
  number: requireStrategy(numberStrategies, numberFormat, "numberFormat"),
  array: requireStrategy(arrayStrategies, arrayFormat, "arrayFormat"),
});

// =============================================================================
// Default Strategies
// =============================================================================

/**
 * Default strategies matching DEFAULT_OPTIONS.
 * Used when no custom options are provided.
 */
export const DEFAULT_STRATEGIES: ResolvedStrategies = Object.freeze({
  boolean: booleanStrategies.auto,
  null: nullStrategies.default,
  number: numberStrategies.auto,
  array: arrayStrategies.none,
});
