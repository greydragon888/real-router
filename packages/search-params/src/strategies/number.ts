// packages/route-node/modules/search-params/strategies/number.ts

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
 */
export const autoNumberStrategy: NumberStrategy = {
  decode: (value) => {
    const length = value.length;

    if (length === 0) {
      return null;
    }

    let hasDot = false;

    for (let i = 0; i < length; i++) {
      const ch = value.codePointAt(i);

      if (ch !== undefined && ch >= 48 && ch <= 57) {
        continue; // '0'-'9'
      }

      if (ch === 46 && !hasDot && i !== 0 && i !== length - 1) {
        hasDot = true;

        continue;
      }

      return null; // non-digit, non-dot, or invalid dot position
    }

    return Number(value);
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
