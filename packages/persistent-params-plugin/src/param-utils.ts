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
 * Parses path into base path and query string components.
 * Handles edge cases like leading ?, multiple ?, empty path.
 *
 * @param path - Path to parse (e.g., "/route?param=value")
 * @returns Object with basePath and queryString
 *
 * @example
 * parseQueryString('/users?page=1') // { basePath: '/users', queryString: 'page=1' }
 * parseQueryString('?existing')     // { basePath: '', queryString: 'existing' }
 * parseQueryString('/path')         // { basePath: '/path', queryString: '' }
 */
export function parseQueryString(path: string): {
  basePath: string;
  queryString: string;
} {
  const questionMarkIndex = path.indexOf("?");

  /* v8 ignore start -- @preserve: getRootPath() never contains "?" — only the no-query-string branch is reachable */
  if (questionMarkIndex === -1) {
    /* v8 ignore stop */
    return { basePath: path, queryString: "" };
  }

  /* v8 ignore start -- @preserve: unreachable through factory — getRootPath() has no "?" */
  if (questionMarkIndex === 0) {
    return { basePath: "", queryString: path.slice(1) };
  }

  return {
    basePath: path.slice(0, questionMarkIndex),
    queryString: path.slice(questionMarkIndex + 1),
  };
  /* v8 ignore stop */
}

/**
 * Builds query string from parameter names.
 * Preserves existing query parameters and appends new ones.
 *
 * @param existingQuery - Existing query string (without leading ?)
 * @param paramNames - Parameter names to append
 * @returns Combined query string
 *
 * @example
 * buildQueryString('existing=1', ['mode', 'lang']) // 'existing=1&mode&lang'
 * buildQueryString('', ['mode'])                   // 'mode'
 */
export function buildQueryString(
  existingQuery: string,
  paramNames: readonly string[],
): string {
  /* v8 ignore next 3 -- @preserve: factory short-circuits empty params before reaching buildQueryString */
  if (paramNames.length === 0) {
    return existingQuery;
  }

  /* v8 ignore next -- @preserve: getRootPath() never contains query strings */
  const separator = existingQuery ? "&" : "";

  return existingQuery + separator + paramNames.join("&");
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
