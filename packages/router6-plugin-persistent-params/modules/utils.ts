// packages/real-router-plugin-persistent-params/modules/utils.ts

import { isPrimitiveValue } from "type-guards";

import type { PersistentParamsConfig } from "./types";
import type { Params } from "router6";

const INVALID_PARAM_KEY_REGEX = /[\s#%&/=?\\]/;
const INVALID_CHARS_MESSAGE = String.raw`Cannot contain: = & ? # % / \ or whitespace`;

export function validateParamKey(key: string): void {
  if (INVALID_PARAM_KEY_REGEX.test(key)) {
    throw new TypeError(
      `[router6-plugin-persistent-params] Invalid parameter name "${key}". ${INVALID_CHARS_MESSAGE}`,
    );
  }
}

/**
 * Validates params configuration structure and values.
 * Ensures all parameter names are non-empty strings and all default values are primitives.
 *
 * @param config - Configuration to validate
 * @returns true if configuration is valid
 */
/**
 * Validates params configuration structure and values.
 * Ensures all parameter names are non-empty strings and all default values are primitives.
 *
 * @param config - Configuration to validate
 * @returns true if configuration is valid
 */
export function isValidParamsConfig(
  config: unknown,
): config is PersistentParamsConfig {
  if (config === null || config === undefined) {
    return false;
  }

  // Array configuration: all items must be non-empty strings
  if (Array.isArray(config)) {
    return config.every((item) => {
      if (typeof item !== "string" || item.length === 0) {
        return false;
      }

      try {
        validateParamKey(item);

        return true;
      } catch {
        return false;
      }
    });
  }

  // Object configuration: must be plain object with primitive values
  if (typeof config === "object") {
    // Reject non-plain objects (Date, Map, etc.)
    if (Object.getPrototypeOf(config) !== Object.prototype) {
      return false;
    }

    // All keys must be non-empty strings, all values must be primitives
    return Object.entries(config).every(([key, value]) => {
      // Check key is non-empty string
      if (typeof key !== "string" || key.length === 0) {
        return false;
      }

      // Validate key doesn't contain special characters
      try {
        validateParamKey(key);
      } catch {
        return false;
      }

      // Validate value is primitive (NaN/Infinity already rejected by isPrimitiveValue)
      return isPrimitiveValue(value);
    });
  }

  return false;
}

/**
 * Validates parameter value before persisting.
 * Throws descriptive TypeError if value is not valid for URL parameters.
 *
 * @param key - Parameter name for error messages
 * @param value - Value to validate
 * @throws {TypeError} If value is null, array, object, or other non-primitive type
 */
export function validateParamValue(key: string, value: unknown): void {
  if (value === null) {
    throw new TypeError(
      `[router6-plugin-persistent-params] Parameter "${key}" cannot be null. ` +
        `Use undefined to remove the parameter from persistence.`,
    );
  }

  if (value !== undefined && !isPrimitiveValue(value)) {
    const actualType = Array.isArray(value) ? "array" : typeof value;

    throw new TypeError(
      `[router6-plugin-persistent-params] Parameter "${key}" must be a primitive value ` +
        `(string, number, or boolean), got ${actualType}. ` +
        `Objects and arrays are not supported in URL parameters.`,
    );
  }
}

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
    // Only process own properties, skip inherited ones
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

  // No query string
  if (questionMarkIndex === -1) {
    return { basePath: path, queryString: "" };
  }

  // Path starts with ? (edge case)
  if (questionMarkIndex === 0) {
    return { basePath: "", queryString: path.slice(1) };
  }

  // Normal case: path?query
  return {
    basePath: path.slice(0, questionMarkIndex),
    queryString: path.slice(questionMarkIndex + 1),
  };
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
  if (paramNames.length === 0) {
    return existingQuery;
  }

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
