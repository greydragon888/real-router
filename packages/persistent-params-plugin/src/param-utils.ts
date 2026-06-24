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
    // Skip inherited (e.g. prototype-polluted) keys — this is the boundary guard
    // the docstring describes; the "excludes inherited properties" unit test drives
    // an Object.create(proto) object through the `false` branch.
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

  for (const [key, value] of Object.entries(current)) {
    if (value === undefined) {
      delete result[key];
    } else {
      result[key] = value;
    }
  }

  return result;
}
