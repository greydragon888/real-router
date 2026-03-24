// packages/core/src/namespaces/OptionsNamespace/validators.ts

/**
 * Static validation functions for OptionsNamespace.
 * Called by Router facade before instance methods.
 */

import { isObjKey, getTypeDescription } from "type-guards";

import {
  defaultOptions,
  VALID_OPTION_VALUES,
  VALID_QUERY_PARAMS,
} from "./constants";

import type { Options } from "@real-router/types";

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
  // Allow callback functions for dynamic default route/params options
  // MUST be first check — before object branch (L140) which would reject
  // functions via validatePlainObject for defaultParams (default = {})
  if (
    typeof value === "function" &&
    (optionName === "defaultRoute" || optionName === "defaultParams")
  ) {
    return; // Valid — callback resolved at runtime
  }

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

function validateOptionalField(key: string, methodName: string): boolean {
  if (key === "limits") {
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
    if (!isObjKey(key, defaultOptions)) {
      validateOptionalField(key, methodName);
      continue;
    }

    // Skip undefined values for conditional configuration
    if (value === undefined) {
      continue;
    }

    validateOptionValue(key, value, methodName);
  }
}
