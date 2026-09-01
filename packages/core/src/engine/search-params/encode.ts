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
import { safeEncode } from "./utils";

import type { FinalOptions, Options } from "./types";

// =============================================================================
// Default Query Params
// =============================================================================

/**
 * Default query parameter options. Single source of truth for all packages.
 */
export const DEFAULT_QUERY_PARAMS: FinalOptions = Object.freeze({
  arrayFormat: "none",
  booleanFormat: "auto",
  nullFormat: "default",
  numberFormat: "auto",
});

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
 *
 * ⚑ FROZEN, and both siblings above with it. `makeOptions` hands this exact object
 * back by reference — a pinned perf invariant, not an accident — so an unfrozen
 * one is a process-global (the #897 class: `LEVEL_CONFIGS` exported unfrozen
 * corrupted the global threshold). Nothing in the engine mutates any of the
 * three; they are read-only by intent, and now by construction.
 *
 * ⚠ Who actually reaches THIS object is narrower than "every default router", and
 * the distinction is worth keeping straight because the two singletons differ.
 * `OptionsNamespace` fills `queryParams` with `DEFAULT_QUERY_PARAMS`, whose four
 * fields are all DEFINED — so the all-undefined guard below does not fire and a
 * default-configured router gets a FRESH object. `DEFAULT_QUERY_PARAMS` is the
 * one every such router shares by reference; this one is reached by a caller that
 * passes nothing, or a bag with no format set.
 *
 * Frozen HERE, at its own site, because nothing else SEALS it: it is
 * `OptionsNamespace`'s default `queryParams`, and that freeze stops at the level
 * core owns (#1832).
 */
const DEFAULT_OPTIONS: OptionsWithStrategies = Object.freeze({
  ...DEFAULT_QUERY_PARAMS,
  strategies: DEFAULT_STRATEGIES,
});

/**
 * Creates options with defaults and pre-resolved strategies.
 * Returns cached DEFAULT_OPTIONS when no custom options are specified.
 */
export const makeOptions = (opts?: Options): OptionsWithStrategies => {
  if (
    !opts ||
    (opts.arrayFormat === undefined &&
      opts.booleanFormat === undefined &&
      opts.nullFormat === undefined &&
      opts.numberFormat === undefined)
  ) {
    return DEFAULT_OPTIONS;
  }

  // Avoid object spread - direct property assignment is faster
  const arrayFormat = opts.arrayFormat ?? DEFAULT_QUERY_PARAMS.arrayFormat;
  const booleanFormat =
    opts.booleanFormat ?? DEFAULT_QUERY_PARAMS.booleanFormat;
  const nullFormat = opts.nullFormat ?? DEFAULT_QUERY_PARAMS.nullFormat;
  const numberFormat = opts.numberFormat ?? DEFAULT_QUERY_PARAMS.numberFormat;

  return {
    arrayFormat,
    booleanFormat,
    nullFormat,
    numberFormat,
    strategies: resolveStrategies(
      arrayFormat,
      booleanFormat,
      nullFormat,
      numberFormat,
    ),
  };
};

// =============================================================================
// Value Encoding
// =============================================================================

/**
 * Encodes a value for use in a URL query string.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
export const encodeValue = (value: any): string => safeEncode(value);

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
        return opts.strategies.array.encodeArray(
          encodedName,
          value,
          opts.strategies.null,
        );
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
