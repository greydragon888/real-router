// packages/route-node/modules/search-params/strategies/array.ts

/**
 * Array encoding strategies.
 *
 * @module search-params/strategies/array
 */

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
   * @returns Query string segment (e.g., "items=a&items=b" or "items=a,b")
   */
  encodeArray: (name: string, values: unknown[]) => string;

  /**
   * Splits a raw (URI-encoded) value into array parts during parsing.
   * Returns null if the value is not an array in this format.
   *
   * @param rawValue - Raw value before URI decoding
   * @returns Array of raw parts, or null if not an array
   */
  decodeValue?: (rawValue: string) => string[] | null;
}

// =============================================================================
// Helpers
// =============================================================================

const encodeValue = (value: unknown): string => {
  const type = typeof value;

  if (type !== "string" && type !== "number" && type !== "boolean") {
    const received = type === "object" && value === null ? "null" : type;

    throw new TypeError(
      `[search-params] Array element must be a string, number, or boolean — received ${received}`,
    );
  }

  return encodeURIComponent(value as string | number | boolean);
};

// =============================================================================
// Strategy Implementations
// =============================================================================

/**
 * Repeated keys without brackets.
 * Example: items=a&items=b
 */
export const noneArrayStrategy: ArrayStrategy = {
  encodeArray: (name, values) => {
    if (values.length === 0) {
      return "";
    }

    let result = `${name}=${encodeValue(values[0])}`;

    for (let i = 1; i < values.length; i++) {
      result += `&${name}=${encodeValue(values[i])}`;
    }

    return result;
  },
};

/**
 * Bracket notation without index.
 * Example: items[]=a&items[]=b
 */
export const bracketsArrayStrategy: ArrayStrategy = {
  encodeArray: (name, values) => {
    if (values.length === 0) {
      return "";
    }

    let result = `${name}[]=${encodeValue(values[0])}`;

    for (let i = 1; i < values.length; i++) {
      result += `&${name}[]=${encodeValue(values[i])}`;
    }

    return result;
  },
};

/**
 * Indexed bracket notation.
 * Example: items[0]=a&items[1]=b
 */
export const indexArrayStrategy: ArrayStrategy = {
  encodeArray: (name, values) => {
    if (values.length === 0) {
      return "";
    }

    let result = `${name}[0]=${encodeValue(values[0])}`;

    for (let i = 1; i < values.length; i++) {
      result += `&${name}[${i}]=${encodeValue(values[i])}`;
    }

    return result;
  },
};

/**
 * Comma-separated values.
 * Example: items=a,b,c
 */
export const commaArrayStrategy: ArrayStrategy = {
  encodeArray: (name, values) => {
    if (values.length === 0) {
      return "";
    }

    let result = `${name}=${encodeValue(values[0])}`;

    for (let i = 1; i < values.length; i++) {
      result += `,${encodeValue(values[i])}`;
    }

    return result;
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
