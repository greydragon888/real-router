// packages/route-node/modules/search-params/searchParams.ts

/**
 * Search Params - Query String Parsing and Building.
 *
 * Internalized from https://github.com/troch/search-params (MIT License)
 * for better code control and optimization.
 *
 * @module search-params/searchParams
 */

import { decode, decodeValue } from "./decode";
import { encode, makeOptions } from "./encode";
import { getSearch } from "./utils";

import type { ResolvedStrategies } from "./strategies";
import type { KeepResponse, OmitResponse, Options } from "./types";

// =============================================================================
// Internal Helpers
// =============================================================================

/**
 * Extracts parameter name from raw name (removes bracket suffix).
 *
 * @internal
 */
function extractParamName(rawName: string): {
  name: string;
  hasBrackets: boolean;
} {
  const bracketPos = rawName.indexOf("[");

  return bracketPos === -1
    ? { name: rawName, hasBrackets: false }
    : { name: rawName.slice(0, bracketPos), hasBrackets: true };
}

/**
 * Adds a decoded value to params object, handling array accumulation.
 *
 * @internal
 */
function addToParams(
  params: Record<string, unknown>,
  decodedName: string,
  decodedValue: unknown,
  hasBrackets: boolean,
): void {
  const currentValue = params[decodedName];

  if (currentValue === undefined) {
    params[decodedName] = hasBrackets ? [decodedValue] : decodedValue;
  } else if (Array.isArray(currentValue)) {
    currentValue.push(decodedValue);
  } else {
    params[decodedName] = [currentValue, decodedValue];
  }
}

/**
 * Decodes a parameter value based on whether strategies are provided.
 *
 * @internal
 */
function decodeParamValue(
  searchPart: string,
  eqPos: number,
  end: number,
  hasValue: boolean,
  strategies: ResolvedStrategies | undefined,
): unknown {
  if (strategies) {
    const rawValue = hasValue ? searchPart.slice(eqPos + 1, end) : undefined;

    return decode(rawValue, strategies);
  }

  return hasValue ? decodeValue(searchPart.slice(eqPos + 1, end)) : null;
}

/**
 * Processes a single query parameter chunk and adds to params.
 *
 * @internal
 */
function processParamChunk(
  searchPart: string,
  start: number,
  end: number,
  params: Record<string, unknown>,
  strategies?: ResolvedStrategies,
): void {
  const eqPos = searchPart.indexOf("=", start);
  const hasValue = eqPos !== -1 && eqPos < end;

  const rawName = hasValue
    ? searchPart.slice(start, eqPos)
    : searchPart.slice(start, end);

  const { name, hasBrackets } = extractParamName(rawName);
  const decodedName = decodeValue(name);
  const decodedValue = decodeParamValue(
    searchPart,
    eqPos,
    end,
    hasValue,
    strategies,
  );

  addToParams(params, decodedName, decodedValue, hasBrackets);
}

/**
 * Iterates over query string parameters, calling handler for each chunk.
 *
 * @internal
 */
function forEachParam(
  searchPart: string,
  handler: (chunk: string, start: number, end: number) => void,
): void {
  let start = 0;
  const len = searchPart.length;

  while (start < len) {
    let end = searchPart.indexOf("&", start);

    if (end === -1) {
      end = len;
    }

    handler(searchPart.slice(start, end), start, end);
    start = end + 1;
  }
}

// =============================================================================
// Parse
// =============================================================================

/**
 * Parse a querystring and return an object of parameters.
 *
 * @example
 * ```typescript
 * parse("page=1&sort=name");
 * // => { page: "1", sort: "name" }
 *
 * parse("items[]=a&items[]=b", { arrayFormat: "brackets" });
 * // => { items: ["a", "b"] }
 * ```
 */
export const parse = (
  path: string,
  opts?: Options,
): Record<string, unknown> => {
  const searchPart = getSearch(path);

  // Fast path: empty query string
  if (searchPart === "" || searchPart === "?") {
    return {};
  }

  // Fast path: no options - use simplified parser (skip strategy resolution)
  if (!opts) {
    return parseSimple(searchPart);
  }

  const options = makeOptions(opts);
  const params: Record<string, unknown> = {};

  // Process each parameter
  let start = 0;
  const len = searchPart.length;

  while (start < len) {
    let end = searchPart.indexOf("&", start);

    if (end === -1) {
      end = len;
    }

    processParamChunk(searchPart, start, end, params, options.strategies);
    start = end + 1;
  }

  return params;
};

/**
 * Simplified parse without strategy resolution.
 * Used when no options are provided (most common case).
 * Returns string values only (no boolean/null conversion).
 *
 * @internal
 */
function parseSimple(searchPart: string): Record<string, unknown> {
  const params: Record<string, unknown> = {};

  parseIntoInternal(searchPart, params);

  return params;
}

/**
 * Parse query string directly into a target object.
 * Avoids creating intermediate object and Object.assign.
 * Optimized for loose mode query params handling.
 *
 * @param queryString - Query string without leading "?"
 * @param target - Object to add params to
 */
export function parseInto(
  queryString: string,
  target: Record<string, unknown>,
): void {
  if (queryString === "") {
    return;
  }

  parseIntoInternal(queryString, target);
}

/**
 * Internal function to parse query string into target object.
 * Shared by parseSimple and parseInto.
 *
 * @internal
 */
function parseIntoInternal(
  searchPart: string,
  params: Record<string, unknown>,
): void {
  let start = 0;
  const len = searchPart.length;

  while (start < len) {
    let end = searchPart.indexOf("&", start);

    if (end === -1) {
      end = len;
    }

    // No strategies = simple decoding
    processParamChunk(searchPart, start, end, params);
    start = end + 1;
  }
}

// =============================================================================
// Build
// =============================================================================

/**
 * Build a querystring from an object of parameters.
 *
 * @example
 * ```typescript
 * build({ page: 1, sort: "name" });
 * // => "page=1&sort=name"
 *
 * build({ items: ["a", "b"] }, { arrayFormat: "brackets" });
 * // => "items[]=a&items[]=b"
 * ```
 */
export const build = (
  params: Record<string, unknown>,
  opts?: Options,
): string => {
  // Fast path for empty params (common case)
  const keys = Object.keys(params);

  if (keys.length === 0) {
    return "";
  }

  const options = makeOptions(opts);

  // Optimized: single loop instead of filter().map().filter().join()
  // Avoids creating 3 intermediate arrays
  const parts: string[] = [];

  for (const key of keys) {
    const value = params[key];

    // Skip undefined values (not serialisable)
    if (value === undefined) {
      continue;
    }

    const encoded = encode(key, value, options);

    // Skip empty strings (e.g., from nullFormat: "hidden")
    if (encoded) {
      parts.push(encoded);
    }
  }

  return parts.join("&");
};

// =============================================================================
// Omit
// =============================================================================

/**
 * Remove a list of parameters from a querystring.
 *
 * @example
 * ```typescript
 * omit("page=1&sort=name&limit=10", ["sort", "limit"]);
 * // => { querystring: "page=1", removedParams: { sort: "name", limit: "10" } }
 * ```
 */
export const omit = (
  path: string,
  paramsToOmit: string[],
  opts?: Options,
): OmitResponse => {
  const searchPart = getSearch(path);

  if (searchPart === "") {
    return { querystring: "", removedParams: {} };
  }

  // Fast path: no params to omit - keep entire querystring
  if (paramsToOmit.length === 0) {
    const hasPrefix = path.startsWith("?");

    return {
      querystring: hasPrefix ? path : searchPart,
      removedParams: {},
    };
  }

  const options = makeOptions(opts);
  const hasPrefix = path.startsWith("?");
  const omitSet = new Set(paramsToOmit);
  const kept: string[] = [];
  const removed: string[] = [];

  forEachParam(searchPart, (chunk) => {
    const eqPos = chunk.indexOf("=");
    const rawName = eqPos === -1 ? chunk : chunk.slice(0, eqPos);
    const { name } = extractParamName(rawName);

    if (omitSet.has(name)) {
      removed.push(chunk);
    } else {
      kept.push(chunk);
    }
  });

  const querystring = kept.join("&");

  return {
    querystring: hasPrefix && querystring ? `?${querystring}` : querystring,
    removedParams: parse(removed.join("&"), options),
  };
};

// =============================================================================
// Keep
// =============================================================================

/**
 * Keep only specified parameters from a querystring.
 *
 * @example
 * ```typescript
 * keep("page=1&sort=name&limit=10", ["page"]);
 * // => { querystring: "page=1", keptParams: { page: "1" } }
 * ```
 */
export const keep = (
  path: string,
  paramsToKeep: string[],
  opts?: Options,
): KeepResponse => {
  const searchPart = getSearch(path);

  if (searchPart === "") {
    return { keptParams: {}, querystring: "" };
  }

  // Fast path: no params to keep
  if (paramsToKeep.length === 0) {
    return { keptParams: {}, querystring: "" };
  }

  const options = makeOptions(opts);
  const keepSet = new Set(paramsToKeep);
  const kept: string[] = [];

  forEachParam(searchPart, (chunk) => {
    const eqPos = chunk.indexOf("=");
    const rawName = eqPos === -1 ? chunk : chunk.slice(0, eqPos);
    const { name } = extractParamName(rawName);

    if (keepSet.has(name)) {
      kept.push(chunk);
    }
  });

  const querystring = kept.join("&");

  return { keptParams: parse(querystring, options), querystring };
};
