/**
 * Number decoding strategies.
 *
 * @module search-params/strategies/number
 */

import type { NumberFormat } from "../types";

// =============================================================================
// Strategy Interface
// =============================================================================

/**
 * Strategy for decoding number values.
 */
export interface NumberStrategy {
  decode: (decodedValue: string) => number | null;
}

// =============================================================================
// Strategy Implementations
// =============================================================================

/**
 * No special number handling - values remain strings.
 */
export const noneNumberStrategy: NumberStrategy = {
  decode: () => null, // passthrough
};

/**
 * Auto-detect numeric values and parse as numbers.
 * Matches integers and decimals via charCode scan (faster than regex for short strings).
 *
 * Recognizes an optional leading `-` so negatives round-trip symmetrically with the
 * values `navigate()`/`build()` produce (`build({ n: -5 })` → `"n=-5"`). Leading-zero
 * and unsafe-integer rejection apply to the magnitude regardless of sign. Exponent
 * notation stays a string — `build` never emits a canonical safe exponent, and unsafe
 * exponents would lose precision. (#742)
 */
export const autoNumberStrategy: NumberStrategy = {
  decode: (value) => {
    const length = value.length;

    if (length === 0) {
      return null;
    }

    // Optional leading minus; the magnitude (digits) begins at `start`.
    const start = value.codePointAt(0) === 45 ? 1 : 0; // '-'

    // A bare "-" has no magnitude.
    if (start === length) {
      return null;
    }

    // Leading zeros are not canonical numbers ("00", "007", "-007") — preserve as strings.
    // Allow "0" and "0.x" (single zero or decimal starting with 0).
    if (
      length - start > 1 &&
      value.codePointAt(start) === 48 &&
      value.codePointAt(start + 1) !== 46
    ) {
      return null;
    }

    let hasDot = false;

    for (let i = start; i < length; i++) {
      const ch = value.codePointAt(i);

      if (ch !== undefined && ch >= 48 && ch <= 57) {
        continue; // '0'-'9'
      }

      if (ch === 46 && !hasDot && i !== start && i !== length - 1) {
        hasDot = true;

        continue;
      }

      return null; // non-digit, non-dot, or invalid dot position
    }

    const num = Number(value);

    // The stated criterion is round-trip stability, enforced directly rather than
    // through per-case guards: `build` prints a number with String(), so a value
    // may be coerced only when String() reproduces the exact text we parsed. This
    // subsumes the former negative-zero guard (String(-0) === "0" ≠ "-0", #898)
    // and closes the decimal family the safe-integer check below deliberately
    // exempts — trailing zeros ("2.0" → 2 → "2") and precision loss
    // ("9007199254740993.5" → 9007199254740994), both of which rebuilt a URL
    // different from the one that was matched. (#1565)
    if (String(num) !== value) {
      return null;
    }

    // Unsafe integers pass the text check (2**53 prints back exactly) but lose
    // precision in arithmetic, so they stay strings. Decimals are exempt: a
    // fractional value is never a "safe integer", and the check above already
    // proves its text round-trips.
    if (!Number.isSafeInteger(num) && !hasDot) {
      return null;
    }

    return num;
  },
};

// =============================================================================
// Strategy Map
// =============================================================================

/**
 * Map of number format to strategy implementation.
 */
export const numberStrategies: Record<NumberFormat, NumberStrategy> = {
  auto: autoNumberStrategy,
  none: noneNumberStrategy,
};
