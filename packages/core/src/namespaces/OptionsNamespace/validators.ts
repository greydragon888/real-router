// packages/core/src/namespaces/OptionsNamespace/validators.ts

/**
 * Static validation functions for OptionsNamespace.
 * Called by Router facade before instance methods.
 */

import { isObjKey, getTypeDescription } from "type-guards";

import {
  defaultOptions,
  UNLOCKED_OPTIONS,
  VALID_OPTION_VALUES,
  VALID_QUERY_PARAMS,
} from "./constants";
import { optionNotFoundError } from "./helpers";
import { LIMIT_BOUNDS } from "../../constants";

import type { LimitsConfig, Options } from "@real-router/types";

/**
 * Validates that option name is a string.
 */
export function validateOptionName(
  name: unknown,
  methodName: string,
): asserts name is string {
  if (typeof name !== "string") {
    throw new TypeError(
      `[router.${methodName}]: option name must be a string, got ${typeof name}`,
    );
  }
}

/**
 * Validates that option exists in defaults.
 */
export function validateOptionExists(
  optionName: string,
  methodName: string,
): void {
  if (!Object.hasOwn(defaultOptions, optionName)) {
    throw optionNotFoundError(methodName, optionName as keyof Options);
  }
}

/**
 * Validates that options are not locked for this option.
 */
export function validateNotLocked(isLocked: boolean, optionName: string): void {
  if (isLocked && !UNLOCKED_OPTIONS.has(optionName as keyof Options)) {
    throw new Error(
      `[router.setOption] Options cannot be changed after router.start(). ` +
        `Only defaultRoute/defaultParams can be changed after start.`,
    );
  }
}

/**
 * Validates that value is a plain object without getters.
 */
export function validatePlainObject(
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
export function validateQueryParams(
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
export function validateEnumOption(
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

/**
 * Validates a single option value against expected type and constraints.
 * Skips validation for unknown options - validateOptionExists handles that.
 */
export function validateOptionValue(
  optionName: keyof Options,
  value: unknown,
  methodName: string,
): void {
  const expectedValue = defaultOptions[optionName];

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

/**
 * Validates optional fields not in defaultOptions.
 * Note: logger is handled before validateOptions in Router constructor.
 */
function validateOptionalField(
  key: string,
  value: unknown,
  methodName: string,
): boolean {
  if (key === "limits") {
    if (value !== undefined) {
      validateLimits(value, methodName);
    }

    return true;
  }

  throw new TypeError(`[router.${methodName}] Unknown option: "${key}"`);
}

/**
 * Validates a partial options object.
 * Called by facade before constructor/withOptions.
 */
export function validateOptions(
  options: unknown,
  methodName: string,
): asserts options is Partial<Options> {
  if (
    !options ||
    typeof options !== "object" ||
    options.constructor !== Object
  ) {
    throw new TypeError(
      `[router.${methodName}] Invalid options: expected plain object, got ${getTypeDescription(options)}`,
    );
  }

  for (const [key, value] of Object.entries(options)) {
    // Skip optional fields that aren't in defaultOptions (limits, logger, etc.)
    /* v8 ignore next -- @preserve branch: optional field handled separately */
    if (!isObjKey(key, defaultOptions)) {
      validateOptionalField(key, value, methodName);
      continue;
    }

    // Skip undefined values for conditional configuration
    if (value === undefined) {
      continue;
    }

    validateOptionValue(key, value, methodName);
  }
}

/**
 * Validates that a limit value is within bounds.
 */
export function validateLimitValue(
  limitName: keyof LimitsConfig,
  value: unknown,
  methodName: string,
): void {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new TypeError(
      `[router.${methodName}]: limit "${limitName}" must be an integer, got ${String(value)}`,
    );
  }

  const bounds = LIMIT_BOUNDS[limitName];

  if (value < bounds.min || value > bounds.max) {
    throw new RangeError(
      `[router.${methodName}]: limit "${limitName}" must be between ${bounds.min} and ${bounds.max}, got ${value}`,
    );
  }
}

/**
 * Validates a partial limits object.
 */
export function validateLimits(
  limits: unknown,
  methodName: string,
): asserts limits is Partial<LimitsConfig> {
  if (!limits || typeof limits !== "object" || limits.constructor !== Object) {
    throw new TypeError(
      `[router.${methodName}]: invalid limits: expected plain object, got ${typeof limits}`,
    );
  }

  for (const [key, value] of Object.entries(limits)) {
    if (!Object.hasOwn(LIMIT_BOUNDS, key)) {
      throw new TypeError(`[router.${methodName}]: unknown limit: "${key}"`);
    }

    if (value === undefined) {
      continue;
    }

    validateLimitValue(key as keyof LimitsConfig, value, methodName);
  }
}
