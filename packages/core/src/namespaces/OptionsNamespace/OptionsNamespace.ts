// packages/core/src/namespaces/OptionsNamespace/OptionsNamespace.ts

import { isObjKey } from "type-guards";

import {
  defaultOptions,
  UNLOCKED_OPTIONS,
  VALID_OPTION_VALUES,
  VALID_QUERY_PARAMS,
} from "./constants";
import { deepFreeze, optionNotFoundError } from "./helpers";
import { getTypeDescription } from "../../helpers";

import type { Options } from "@real-router/types";

/**
 * Independent namespace for managing router options.
 *
 * Static methods handle validation (called by facade).
 * Instance methods handle storage and lock state.
 */
export class OptionsNamespace {
  #options: Readonly<Options>;
  #locked = false;

  constructor(initialOptions: Partial<Options> = {}) {
    // Note: validation should be done by facade before calling constructor
    this.#options = deepFreeze({
      ...defaultOptions,
      ...initialOptions,
    });
  }

  // =========================================================================
  // Static validation methods (called by facade before instance methods)
  // =========================================================================

  /**
   * Validates that option name is a string.
   */
  static validateOptionName(
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
   * Validates that value is a plain object without getters.
   */
  static validatePlainObject(
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
  static validateQueryParams(
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
  static validateEnumOption(
    optionName: keyof typeof VALID_OPTION_VALUES,
    value: unknown,
    methodName: string,
  ): void {
    const validValues = VALID_OPTION_VALUES[optionName];
    const isValid = (validValues as readonly string[]).includes(
      value as string,
    );

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
   * Skips validation for unknown options - namespace method will throw proper error.
   */
  static validateOptionValue(
    optionName: keyof Options,
    value: unknown,
    methodName: string,
  ): void {
    // Skip unknown options - let namespace's set() method throw ReferenceError
    if (!Object.hasOwn(defaultOptions, optionName)) {
      return;
    }

    const expectedValue = defaultOptions[optionName];

    // For object options - ensure plain objects only (not null, arrays, Date, etc)
    if (expectedValue && typeof expectedValue === "object") {
      OptionsNamespace.validatePlainObject(value, optionName, methodName);

      if (optionName === "queryParams") {
        OptionsNamespace.validateQueryParams(value, methodName);
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
      OptionsNamespace.validateEnumOption(
        optionName as keyof typeof VALID_OPTION_VALUES,
        value,
        methodName,
      );
    }
  }

  /**
   * Validates a partial options object.
   * Called by facade before constructor/withOptions.
   */
  static validateOptions(
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
      if (!isObjKey(key, defaultOptions)) {
        throw new TypeError(`[router.${methodName}] Unknown option: "${key}"`);
      }

      // Skip undefined values for conditional configuration
      if (value === undefined) {
        continue;
      }

      OptionsNamespace.validateOptionValue(key, value, methodName);
    }
  }

  // =========================================================================
  // Instance methods (trust input - already validated by facade)
  // =========================================================================

  /**
   * Returns the frozen options object.
   * Safe to return directly - mutations will throw in strict mode.
   */
  get(): Readonly<Options> {
    return this.#options;
  }

  /**
   * Gets a single option value.
   *
   * @param optionName - Already validated by facade
   */
  getOption<K extends keyof Options>(optionName: K): Options[K] {
    if (!Object.hasOwn(this.#options, optionName)) {
      throw optionNotFoundError("getOption", optionName);
    }

    return this.#options[optionName];
  }

  /**
   * Sets a single option value.
   * Throws if locked and option is not in UNLOCKED_OPTIONS.
   *
   * @param optionName - Already validated by facade
   * @param value - Already validated by facade
   */
  set<K extends keyof Options>(optionName: K, value: Options[K]): void {
    // Check lock state (business logic, not input validation)
    if (this.#locked && !UNLOCKED_OPTIONS.has(optionName)) {
      throw new Error(
        `[router.setOption] Options cannot be changed after router.start(). ` +
          `Only defaultRoute/defaultParams can be changed after start.`,
      );
    }

    // Use Object.hasOwn to reject prototype keys like __proto__
    if (!Object.hasOwn(this.#options, optionName)) {
      throw optionNotFoundError("setOption", optionName);
    }

    // Recreate frozen options with new value
    // For nested objects (defaultParams), create a shallow copy to avoid
    // sharing mutable references
    const newValue =
      value && typeof value === "object" && value.constructor === Object
        ? { ...value }
        : value;

    this.#options = deepFreeze({
      ...this.#options,
      [optionName]: newValue,
    });
  }

  /**
   * Locks options - called when router starts.
   * After locking, only UNLOCKED_OPTIONS can be changed.
   */
  lock(): void {
    this.#locked = true;
  }

  /**
   * Unlocks options - called when router stops.
   */
  unlock(): void {
    this.#locked = false;
  }
}
