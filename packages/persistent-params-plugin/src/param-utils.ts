// packages/persistent-params-plugin/src/param-utils.ts

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
 *
 * IMPORTANT: `current` must be pre-sanitized via `extractOwnParams()` by the caller.
 * This function does NOT perform prototype pollution protection on its own.
 *
 * @param persistent - Frozen persistent parameters
 * @param current - Pre-sanitized current parameters (own properties only)
 */
export function mergeParams(
  persistent: Readonly<Params>,
  current: Params,
): Params {
  const result: Params = {};

  for (const key in persistent) {
    if (Object.hasOwn(persistent, key) && persistent[key] !== undefined) {
      result[key] = persistent[key];
    }
  }

  for (const key of Object.keys(current)) {
    const value = current[key];

    if (value === undefined) {
      delete result[key];
    } else {
      result[key] = value;
    }
  }

  return result;
}
