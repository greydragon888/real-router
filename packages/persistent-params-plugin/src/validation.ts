// packages/persistent-params-plugin/src/validation.ts

import { ERROR_PREFIX } from "./constants";
import { isPrimitiveValue } from "./is-primitive-value";

import type { PersistentParamsConfig } from "./types";

/**
 * Intrinsics captured at module load (#1971).
 *
 * ⚑ These DECIDE — each answers "what is on this object" for a value this module
 * did not build, so read off the live global they are the weakest point of every
 * check built on them. `guards.ts` states the doctrine and its measurement: one
 * naive `Object.hasOwn` polyfill walked straight through five sibling readers
 * while the single captured guard held.
 *
 * ⚠ Capture narrows the window from "any time after boot" to "before this module
 * loads". It does not close it — a shim evaluated ahead of core still wins
 * (#1798), which is the doctrine's own caveat and travels with it.
 */
const objectEntries = Object.entries;
const getPrototypeOf = Object.getPrototypeOf;
const objectKeys = Object.keys;

const INVALID_PARAM_KEY_REGEX = /[\s#%&/=?\\]/;
const INVALID_CHARS_MESSAGE = String.raw`Cannot contain: = & ? # % / \ or whitespace`;

/**
 * The one name the router withholds from `state.params` / `state.search` at the
 * channel copy (#1792 / #1852), so a persistent param called this can never
 * reach a URL (#1810).
 *
 * ⚠ Deliberately ONE name, not `Object.prototype`'s twelve. Measured, each
 * tracked and navigated with a value: `toString`, `constructor`, `valueOf` and
 * `hasOwnProperty` all print `/page?<name>=V` and land in `state.search` — they
 * are ordinary data to the router, and refusing them would retire a working
 * capability. `__proto__` alone prints `/page` with an empty `search`.
 *
 * Not imported from core: the constant is internal there, and duplicating one
 * string literal is cheaper than widening core's public surface for it. The
 * behaviour it mirrors is pinned on both sides.
 */
const UNPUBLISHABLE_PARAM_KEY = "__proto__";

export function validateParamKey(key: string): void {
  if (INVALID_PARAM_KEY_REGEX.test(key)) {
    throw new TypeError(
      `${ERROR_PREFIX} Invalid parameter name "${key}". ${INVALID_CHARS_MESSAGE}`,
    );
  }

  // Refused here rather than left to fail silently later: accepted, it produced
  // a `state.context.persistentParams` carrying `__proto__: undefined` beside
  // the params that do work, and no URL ever showed it.
  if (key === UNPUBLISHABLE_PARAM_KEY) {
    throw new TypeError(
      `${ERROR_PREFIX} Invalid parameter name "${key}". The router never publishes this key into a state channel, so a persistent param named it can never reach a URL.`,
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
    if (getPrototypeOf(config) !== Object.prototype) {
      return false;
    }

    // All keys must be non-empty strings, all values must be primitives
    return objectEntries(config).every(([key, value]) => {
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
export function validateParamValue(
  key: string,
  value: unknown,
): asserts value is string | number | boolean | undefined {
  if (value === null) {
    throw new TypeError(
      `${ERROR_PREFIX} Parameter "${key}" cannot be null. ` +
        `Use undefined to remove the parameter from persistence.`,
    );
  }

  if (value !== undefined && !isPrimitiveValue(value)) {
    const actualType = Array.isArray(value) ? "array" : typeof value;

    throw new TypeError(
      `${ERROR_PREFIX} Parameter "${key}" must be a primitive value ` +
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
/**
 * Names the ONE refusal whose reason the generic message cannot convey (#1810).
 *
 * `"__proto__"` IS a non-empty string, so "Expected array of non-empty strings"
 * reads as a contradiction to whoever wrote it. Every other rejection this
 * validator makes is visible in the value itself (a number, an empty string, a
 * name carrying `?`); this one is a rule about the router, so it has to be said.
 *
 * ⚠ Appended rather than substituted: `plugin.test.ts` pins the
 * `Invalid params configuration` prefix in THIRTEEN assertions
 * (`grep -c 'Invalid params configuration'`), and the charset rejections keep
 * the message they always had.
 */
function unpublishableClause(params: unknown): string {
  // ⚠ `Object.keys` on the ARRAY form would give indices, not the names, so the
  // branch is load-bearing; `?? {}` covers `null`, which reaches here (an
  // invalid config of any shape does). An earlier revision spelled the second
  // arm `typeof params === "object" && params !== null`, and the `typeof` half
  // was an equivalent mutant — the only value it uniquely guarded was
  // `undefined`, which the factory accepts as an empty config and never
  // forwards here.
  const names: readonly string[] = Array.isArray(params)
    ? (params as string[])
    : objectKeys(params ?? {});

  if (!names.includes(UNPUBLISHABLE_PARAM_KEY)) {
    return "";
  }

  return ` The name "${UNPUBLISHABLE_PARAM_KEY}" is refused: the router never publishes it into a state channel, so a persistent param named it can never reach a URL.`;
}

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
      `${ERROR_PREFIX} Invalid params configuration. ` +
        `Expected array of non-empty strings or object with primitive values, got ${actualType}.${unpublishableClause(
          params,
        )}`,
    );
  }
}
