/**
 * Array encoding strategies.
 *
 * @module search-params/strategies/array
 */

import { safeEncode } from "../utils";

import type { NullStrategy } from "./null";
import type { ArrayFormat } from "../types";

// =============================================================================
// Strategy Interface
// =============================================================================

/**
 * Strategy for encoding array values.
 */
export interface ArrayStrategy {
  /**
   * Encodes an array as a query string segment.
   *
   * @param name - URL-encoded parameter name
   * @param values - Array values to encode
   * @param nullStrategy - Null strategy, so a `null` element encodes to the same
   *   wire token a scalar null does (bare key under `default`, dropped under
   *   `hidden`) — closing `range(parse) ⊆ dom(build)` (#1155)
   * @returns Query string segment (e.g., "items=a&items=b" or "items=a,b")
   */
  encodeArray: (
    name: string,
    values: unknown[],
    nullStrategy: NullStrategy,
  ) => string;

  /**
   * Splits a raw (URI-encoded) value into array parts during parsing.
   * Returns null if the value is not an array in this format.
   *
   * @param rawValue - Raw value before URI decoding
   * @returns Array of raw parts, or null if not an array
   */
  decodeValue?: (rawValue: string) => string[] | null;

  /**
   * When true, the parser orders bracketed elements (`a[n]`) by the numeric
   * index `n` rather than insertion order. Only `index` format sets this. (#856)
   */
  indexed?: boolean;
}

// =============================================================================
// Helpers
// =============================================================================

// Encodes a non-null array element. `null` is handled per-format by the caller
// (bare-key / skip); this throws only on genuinely unserialisable elements
// (`undefined`, objects) — which `parse` never produces in an array.
const encodeValue = (value: unknown): string => {
  const type = typeof value;

  if (type !== "string" && type !== "number" && type !== "boolean") {
    // `null` is handled by the caller (bare-key / skip) and never reaches here,
    // so `type` names the offender directly (`undefined`, `object`, `symbol`, …).
    throw new TypeError(
      `[search-params] Array element must be a string, number, or boolean — received ${type}`,
    );
  }

  return safeEncode(value as string | number | boolean);
};

// Repeats `${name}${suffix}` keys joined by `&`. Shared between `none` (suffix
// `""`) and `brackets` (suffix `"[]"`). A `null` element encodes to the SAME
// wire token a scalar null does via `nullStrategy` — the bare key
// `${name}${suffix}` under `nullFormat: "default"`, or `""` (dropped, filtered
// below so no `&&` appears) under `"hidden"`. So `parseQuery("a&a=1")` →
// `{a:[null,"1"]}` round-trips to `"a&a=1"` instead of throwing (#1155).
const repeatKey = (
  name: string,
  values: unknown[],
  suffix: string,
  nullStrategy: NullStrategy,
): string => {
  const key = `${name}${suffix}`;
  const parts: string[] = [];

  for (const value of values) {
    if (value === null) {
      const encoded = nullStrategy.encode(key);

      if (encoded) {
        parts.push(encoded);
      }
    } else {
      parts.push(`${key}=${encodeValue(value)}`);
    }
  }

  return parts.join("&");
};

// =============================================================================
// Strategy Implementations
// =============================================================================

/**
 * Repeated keys without brackets.
 * Example: items=a&items=b
 */
export const noneArrayStrategy: ArrayStrategy = {
  encodeArray: (name, values, nullStrategy) =>
    repeatKey(name, values, "", nullStrategy),
};

/**
 * Bracket notation without index.
 * Example: items[]=a&items[]=b
 */
export const bracketsArrayStrategy: ArrayStrategy = {
  encodeArray: (name, values, nullStrategy) =>
    repeatKey(name, values, "[]", nullStrategy),
};

/**
 * Indexed bracket notation.
 * Example: items[0]=a&items[1]=b
 */
export const indexArrayStrategy: ArrayStrategy = {
  encodeArray: (name, values, nullStrategy) => {
    const parts: string[] = [];

    for (const [i, value] of values.entries()) {
      const key = `${name}[${i}]`;

      if (value === null) {
        const encoded = nullStrategy.encode(key);

        if (encoded) {
          parts.push(encoded);
        }
      } else {
        parts.push(`${key}=${encodeValue(value)}`);
      }
    }

    return parts.join("&");
  },

  indexed: true,
};

/**
 * Comma-separated values.
 * Example: items=a,b,c
 *
 * Comma has no per-element bare-key form (an empty part like `a=,` decodes to
 * the empty string, not `null`), so a `null` element is unrepresentable and
 * dropped. `parse` only yields null-in-array under `comma` via a bracketed
 * chunk (`a[]`) — a wire/format mismatch, never the comma-native path — so this
 * is a total-but-lossy edge. The `nullStrategy` arg is intentionally omitted
 * (a 2-arg impl satisfies the 3-arg interface).
 */
export const commaArrayStrategy: ArrayStrategy = {
  encodeArray: (name, values) => {
    const parts: string[] = [];

    for (const value of values) {
      if (value !== null) {
        parts.push(encodeValue(value));
      }
    }

    if (parts.length === 0) {
      return "";
    }

    return `${name}=${parts.join(",")}`;
  },

  decodeValue: (rawValue) => {
    // No unencoded comma → not an array (single value).
    // Encoded commas (%2C) are part of the value, not separators.
    if (!rawValue.includes(",")) {
      return null;
    }

    return rawValue.split(",");
  },
};

/**
 * Map of array format to strategy implementation.
 */
export const arrayStrategies: Record<ArrayFormat, ArrayStrategy> = {
  none: noneArrayStrategy,
  brackets: bracketsArrayStrategy,
  index: indexArrayStrategy,
  comma: commaArrayStrategy,
};
