// packages/route-node/modules/search-params/encode.ts

/**
 * Encoding functions for search-params.
 *
 * Uses Strategy pattern for format-specific encoding.
 * Strategies are resolved once when options are created.
 *
 * @module search-params/encode
 */

import {
  DEFAULT_STRATEGIES,
  resolveStrategies,
  type ResolvedStrategies,
} from "./strategies";

import type { FinalOptions, Options } from "./types";

// =============================================================================
// Options with Strategies
// =============================================================================

/**
 * Extended options with pre-resolved strategies.
 */
export interface OptionsWithStrategies extends FinalOptions {
  readonly strategies: ResolvedStrategies;
}

/**
 * Cached default options with strategies - avoids allocation when no options passed.
 */
const DEFAULT_OPTIONS: OptionsWithStrategies = {
  arrayFormat: "none",
  booleanFormat: "none",
  nullFormat: "default",
  strategies: DEFAULT_STRATEGIES,
};

/**
 * Creates options with defaults and pre-resolved strategies.
 * Returns cached DEFAULT_OPTIONS when no custom options are specified.
 */
export const makeOptions = (opts?: Options): OptionsWithStrategies => {
  if (
    !opts ||
    (opts.arrayFormat === undefined &&
      opts.booleanFormat === undefined &&
      opts.nullFormat === undefined)
  ) {
    return DEFAULT_OPTIONS;
  }

  // Avoid object spread - direct property assignment is faster
  const arrayFormat = opts.arrayFormat ?? "none";
  const booleanFormat = opts.booleanFormat ?? "none";
  const nullFormat = opts.nullFormat ?? "default";

  return {
    arrayFormat,
    booleanFormat,
    nullFormat,
    strategies: resolveStrategies(arrayFormat, booleanFormat, nullFormat),
  };
};

// =============================================================================
// Value Encoding
// =============================================================================

/**
 * Encodes a value for use in a URL query string.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
export const encodeValue = (value: any): string => encodeURIComponent(value);

// =============================================================================
// Main Encode
// =============================================================================

/**
 * Encodes a parameter name and value as a query string segment.
 *
 * Uses pre-resolved strategies for format-specific encoding.
 * Strategies handle all formats uniformly - no inline optimizations
 * to avoid equivalent mutants in mutation testing.
 *
 * @param name - Parameter name
 * @param value - Parameter value
 * @param opts - Options with pre-resolved strategies
 * @returns Query string segment (e.g., "key=value")
 */
export const encode = (
  name: string,
  value: unknown,
  opts: OptionsWithStrategies,
): string => {
  const encodedName = encodeValue(name);

  // Handle each type using strategies
  switch (typeof value) {
    case "string":
    case "number": {
      return `${encodedName}=${encodeValue(value)}`;
    }
    case "boolean": {
      return opts.strategies.boolean.encode(encodedName, value);
    }
    case "object": {
      // Null check
      if (value === null) {
        return opts.strategies.null.encode(encodedName);
      }
      // Array check
      if (Array.isArray(value)) {
        return opts.strategies.array.encodeArray(encodedName, value);
      }

      // Fallback for other objects - treat as string
      return `${encodedName}=${encodeValue(value)}`;
    }
    default: {
      // Fallback for other types (undefined handled by caller)
      return `${encodedName}=${encodeValue(value)}`;
    }
  }
};
