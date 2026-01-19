// packages/real-router/modules/core/options.ts

import { isObjKey, isString } from "type-guards";

import { getTypeDescription } from "../helpers";

import type { DefaultDependencies, Options, Router } from "router6-types";

const defaultOptions: Options = {
  defaultRoute: "",
  defaultParams: {},
  trailingSlash: "preserve",
  queryParamsMode: "loose",
  queryParams: {
    arrayFormat: "none",
    booleanFormat: "none",
    nullFormat: "default",
  },
  caseSensitive: false,
  urlParamsEncoding: "default",
  allowNotFound: true,
  rewritePathOnMatch: true,
} satisfies Options;

/**
 * Valid values for string enum options.
 * Used for runtime validation in setOption/withOptions.
 */
const VALID_OPTION_VALUES = {
  trailingSlash: ["strict", "never", "always", "preserve"] as const,
  queryParamsMode: ["default", "strict", "loose"] as const,
  urlParamsEncoding: ["default", "uri", "uriComponent", "none"] as const,
} as const;

/**
 * Valid keys and values for queryParams option.
 */
const VALID_QUERY_PARAMS = {
  arrayFormat: ["none", "brackets", "index", "comma"] as const,
  booleanFormat: ["none", "string", "empty-true"] as const,
  nullFormat: ["default", "hidden"] as const,
} as const;

const optionNotFoundError = (method: string, name: keyof Options) =>
  new ReferenceError(`[router.${method}]: option "${name}" not found`);

/**
 * Validates that value is a plain object without getters.
 */
function validatePlainObject(
  value: unknown,
  optionName: string,
  methodName: string,
): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || value.constructor !== Object) {
    throw new TypeError(
      `[router.${methodName}] Invalid type for "${optionName}": ` +
        `expected plain object, got ${getTypeDescription(value)}`,
    );
  }

  // Getters can throw, return different values, or have side effects
  for (const key in value) {
    if (Object.getOwnPropertyDescriptor(value, key)?.get) {
      throw new TypeError(
        `[router.${methodName}] Getters not allowed in "${optionName}": "${key}"`,
      );
    }
  }
}

/**
 * Validates queryParams keys and values against allowed enums.
 */
function validateQueryParams(
  value: Record<string, unknown>,
  methodName: string,
): void {
  for (const key in value) {
    if (!isObjKey(key, VALID_QUERY_PARAMS)) {
      const validKeys = Object.keys(VALID_QUERY_PARAMS)
        .map((k) => `"${k}"`)
        .join(", ");

      throw new TypeError(
        `[router.${methodName}] Unknown queryParams key: "${key}". ` +
          `Valid keys: ${validKeys}`,
      );
    }

    const paramValue = value[key];
    const validValues = VALID_QUERY_PARAMS[key];
    const isValid = (validValues as readonly string[]).includes(
      paramValue as string,
    );

    if (!isValid) {
      const allowedValues = validValues.map((v) => `"${v}"`).join(", ");

      throw new TypeError(
        `[router.${methodName}] Invalid value for queryParams.${key}: ` +
          `expected one of ${allowedValues}, got "${String(paramValue)}"`,
      );
    }
  }
}

/**
 * Validates string enum options against allowed values.
 */
function validateEnumOption(
  optionName: keyof typeof VALID_OPTION_VALUES,
  value: unknown,
  methodName: string,
): void {
  const validValues = VALID_OPTION_VALUES[optionName];
  const isValid = (validValues as readonly string[]).includes(value as string);

  if (!isValid) {
    const allowedValues = validValues.map((v) => `"${v}"`).join(", ");

    throw new TypeError(
      `[router.${methodName}] Invalid value for "${optionName}": ` +
        `expected one of ${allowedValues}, got "${String(value)}"`,
    );
  }
}

function validateOptionValue<K extends keyof Options>(
  optionName: K,
  value: unknown,
  expectedValue: Options[K],
  methodName: string,
): void {
  // For object options - ensure plain objects only (not null, arrays, Date, etc)
  if (expectedValue && typeof expectedValue === "object") {
    validatePlainObject(value, optionName, methodName);

    if (optionName === "queryParams") {
      validateQueryParams(value, methodName);
    }

    return;
  }

  // For primitives - typeof check first
  if (typeof value !== typeof expectedValue) {
    throw new TypeError(
      `[router.${methodName}] Invalid type for "${optionName}": ` +
        `expected ${typeof expectedValue}, got ${typeof value}`,
    );
  }

  // For string enum options - validate against allowed values
  if (optionName in VALID_OPTION_VALUES) {
    validateEnumOption(
      optionName as keyof typeof VALID_OPTION_VALUES,
      value,
      methodName,
    );
  }
}

// =============================================================================
// Deep Freeze Helper
// =============================================================================
// Options contains nested objects (queryParams, defaultParams) that need
// to be frozen recursively to prevent mutation via nested access:
//   router.getOptions().queryParams.arrayFormat = "brackets" // Should throw!
// =============================================================================

/**
 * Recursively freezes an object and all nested objects.
 * Only freezes plain objects, not primitives or special objects.
 */
function deepFreeze<T extends object>(obj: T): Readonly<T> {
  // Freeze the object itself
  Object.freeze(obj);

  // Recursively freeze nested plain objects
  for (const key of Object.keys(obj)) {
    const value = (obj as Record<string, unknown>)[key];

    // Only freeze plain objects (not null, arrays, Date, etc.)
    if (value && typeof value === "object" && value.constructor === Object) {
      deepFreeze(value);
    }
  }

  return obj;
}

export function withOptions<Dependencies extends DefaultDependencies>(
  options: Partial<Options>,
): (router: Router<Dependencies>) => Router<Dependencies> {
  return (router: Router<Dependencies>): Router<Dependencies> => {
    // Validate options on initialization
    for (const [key, value] of Object.entries(options)) {
      if (!isObjKey(key, defaultOptions)) {
        throw new TypeError(`[router.options] Unknown option: "${key}"`);
      }

      // Skip undefined values for conditional configuration
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (value === undefined) {
        continue;
      }

      validateOptionValue(key, value, defaultOptions[key], "withOptions");
    }

    // ==========================================================================
    // Performance Optimization: Frozen Options
    // ==========================================================================
    // Instead of creating a copy on every getOptions() call, we freeze the
    // options object once and return the same reference.
    //
    // Trade-off:
    // - getOptions(): O(n) copy → O(1) reference return
    // - setOption(): O(1) mutation → O(n) object recreation
    //
    // This is beneficial because getOptions() is called frequently (every
    // start(), navigate()), while setOption() is called rarely (initialization).
    // ==========================================================================

    let frozenOptions: Readonly<Options> = deepFreeze({
      ...defaultOptions,
      ...options,
    });

    // Return frozen reference directly - no copy needed!
    // Mutations will throw TypeError in strict mode
    router.getOptions = () => frozenOptions;

    router.setOption = <K extends keyof Options>(
      optionName: K,
      value: Options[K],
    ): Router<Dependencies> => {
      // Validate optionName is a string (TypeScript can be bypassed at runtime)
      if (!isString(optionName)) {
        throw new TypeError(
          `[router.setOption]: option name must be a string, got ${typeof optionName}`,
        );
      }

      // Options cannot be changed after router starts, except defaultRoute/defaultParams
      if (
        router.isStarted() &&
        optionName !== "defaultRoute" &&
        optionName !== "defaultParams"
      ) {
        throw new Error(
          `[router.setOption] Options cannot be changed after router.start(). ` +
            `Only defaultRoute/defaultParams can be changed after start.`,
        );
      }

      // Use Object.hasOwn to reject prototype keys like __proto__
      if (!Object.hasOwn(frozenOptions, optionName)) {
        throw optionNotFoundError("setOption", optionName);
      }

      validateOptionValue(
        optionName,
        value,
        defaultOptions[optionName],
        "setOption",
      );

      // Recreate frozen options with new value
      // For nested objects (defaultParams), create a shallow copy to avoid
      // sharing mutable references
      const newValue =
        value && typeof value === "object" && value.constructor === Object
          ? { ...value }
          : value;

      frozenOptions = deepFreeze({
        ...frozenOptions,
        [optionName]: newValue,
      });

      return router;
    };

    return router;
  };
}
