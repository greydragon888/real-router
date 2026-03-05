// packages/persistent-params-plugin/modules/param-utils.ts

import type { Params } from "@real-router/core";

/**
 * Safely extracts own properties from params object.
 * Uses Object.hasOwn to prevent prototype pollution attacks.
 *
 * @param params - Parameters object (may contain inherited properties)
 * @returns New object with only own properties
 *
 * @example
 * const malicious = Object.create({ __proto__: { admin: true } });
 * malicious.mode = 'dev';
 * const safe = extractOwnParams(malicious); // { mode: 'dev' } (no __proto__)
 */
export function extractOwnParams(params: Params): Params {
  const result: Params = {};

  for (const key in params) {
    /* v8 ignore next -- @preserve: core validates params prototype — inherited keys never reach here */
    if (Object.hasOwn(params, key)) {
      result[key] = params[key];
    }
  }

  return result;
}

/**
 * Merges persistent and current parameters into a single Params object.
 * Keys explicitly set to `undefined` in current params are removed from result.
 *
 * Creates a new immutable object - does not mutate input parameters.
 *
 * @param persistent - Frozen persistent parameters
 * @param current - Current parameters from navigation
 * @returns New Params object with merged values
 *
 * @example
 * const persistent = { lang: 'en', theme: 'dark' };
 * const current = { theme: 'light', mode: 'dev' };
 * mergeParams(persistent, current); // { lang: 'en', theme: 'light', mode: 'dev' }
 *
 * @example
 * // Removing parameters with undefined
 * const persistent = { lang: 'en', theme: 'dark' };
 * const current = { theme: undefined };
 * mergeParams(persistent, current); // { lang: 'en' } (theme removed)
 */
export function mergeParams(
  persistent: Readonly<Params>,
  current: Params,
): Params {
  // Safely extract own properties from current params
  const safeCurrentParams = extractOwnParams(current);

  // Start with persistent params, but EXCLUDE undefined values
  // (undefined values don't appear in URLs, so we shouldn't include them)
  const result: Params = {};

  for (const key in persistent) {
    if (Object.hasOwn(persistent, key) && persistent[key] !== undefined) {
      result[key] = persistent[key];
    }
  }

  // Apply current params
  for (const key of Object.keys(safeCurrentParams)) {
    const value = safeCurrentParams[key];

    if (value === undefined) {
      // Remove param if explicitly set to undefined
      delete result[key];
    } else {
      // Add or update param
      result[key] = value;
    }
  }

  return result;
}
