// packages/core/src/namespaces/OptionsNamespace/OptionsNamespace.ts

import { defaultOptions } from "./constants";
import { deepFreeze } from "./helpers";
import {
  validateNotLocked,
  validateOptionExists,
  validateOptionName,
  validateOptions,
  validateOptionValue,
} from "./validators";

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
  // Proxy to functions in validators.ts for separation of concerns
  // =========================================================================

  static validateOptionName(
    name: unknown,
    methodName: string,
  ): asserts name is string {
    validateOptionName(name, methodName);
  }

  static validateOptionExists(optionName: string, methodName: string): void {
    validateOptionExists(optionName, methodName);
  }

  static validateNotLocked(isLocked: boolean, optionName: string): void {
    validateNotLocked(isLocked, optionName);
  }

  static validateOptionValue(
    optionName: keyof Options,
    value: unknown,
    methodName: string,
  ): void {
    validateOptionValue(optionName, value, methodName);
  }

  static validateOptions(
    options: unknown,
    methodName: string,
  ): asserts options is Partial<Options> {
    validateOptions(options, methodName);
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
   * Input already validated by facade.
   *
   * @param optionName - Already validated by facade
   */
  getOption<K extends keyof Options>(optionName: K): Options[K] {
    return this.#options[optionName];
  }

  /**
   * Sets a single option value.
   * Input already validated by facade (including lock check).
   *
   * @param optionName - Already validated by facade
   * @param value - Already validated by facade
   */
  set<K extends keyof Options>(optionName: K, value: Options[K]): void {
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
   * Returns true if options are locked.
   * Used by facade for lock validation.
   */
  isLocked(): boolean {
    return this.#locked;
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
