// packages/persistent-params-plugin/src/validation.ts

import { isPrimitiveValue } from "type-guards";

import type { PersistentParamsConfig } from "./types";

const INVALID_PARAM_KEY_REGEX = /[\s#%&/=?\\]/;
const INVALID_CHARS_MESSAGE = String.raw`Cannot contain: = & ? # % / \ or whitespace`;

export function validateParamKey(key: string): void {
  if (INVALID_PARAM_KEY_REGEX.test(key)) {
    throw new TypeError(
      `[@real-router/persistent-params-plugin] Invalid parameter name "${key}". ${INVALID_CHARS_MESSAGE}`,
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
      `[@real-router/persistent-params-plugin] Parameter "${key}" cannot be null. ` +
        `Use undefined to remove the parameter from persistence.`,
    );
  }

  if (value !== undefined && !isPrimitiveValue(value)) {
    const actualType = Array.isArray(value) ? "array" : typeof value;

    throw new TypeError(
      `[@real-router/persistent-params-plugin] Parameter "${key}" must be a primitive value ` +
        `(string, number, or boolean), got ${actualType}. ` +
        `Objects and arrays are not supported in URL parameters.`,
    );
  }
}

/**
 * Validates the params configuration and throws a descriptive error if invalid.
 *
 * @param params - Configuration to validate
 * @throws {TypeError} If params is not a valid configuration
 */
export function validateConfig(params: unknown): void {
  if (!isValidParamsConfig(params)) {
    let actualType: string;

    if (params === null) {
      actualType = "null";
    } else if (Array.isArray(params)) {
      actualType = "array with invalid items";
    } else {
      actualType = typeof params;
    }

    throw new TypeError(
      `[@real-router/persistent-params-plugin] Invalid params configuration. ` +
        `Expected array of non-empty strings or object with primitive values, got ${actualType}.`,
    );
  }
}
