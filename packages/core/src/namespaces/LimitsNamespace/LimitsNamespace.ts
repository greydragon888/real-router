// packages/core/src/namespaces/LimitsNamespace/LimitsNamespace.ts

import { DEFAULT_LIMITS } from "./constants";
import { deepFreeze } from "./helpers";
import {
  validateLimitExists,
  validateLimitName,
  validateLimitValue,
  validateLimits,
  type LimitsConfig,
} from "./validators";

/**
 * Independent namespace for managing router limits.
 *
 * Static methods handle validation (called by facade).
 * Instance methods handle storage and access.
 */
export class LimitsNamespace {
  #limits: Readonly<LimitsConfig>;

  constructor(initialLimits: Partial<LimitsConfig> = {}) {
    this.#limits = deepFreeze({
      ...DEFAULT_LIMITS,
      ...initialLimits,
    });
  }

  // =========================================================================
  // Static validation methods (called by facade before instance methods)
  // Proxy to functions in validators.ts for separation of concerns
  // =========================================================================

  static validateLimitName(
    name: unknown,
    methodName: string,
  ): asserts name is string {
    validateLimitName(name, methodName);
  }

  static validateLimitExists(limitName: string, methodName: string): void {
    validateLimitExists(limitName, methodName);
  }

  static validateLimitValue(
    limitName: keyof LimitsConfig,
    value: unknown,
    methodName: string,
  ): void {
    validateLimitValue(limitName, value, methodName);
  }

  static validateLimits(
    limits: unknown,
    methodName: string,
  ): asserts limits is Partial<LimitsConfig> {
    validateLimits(limits, methodName);
  }

  // =========================================================================
  // Instance methods (trust input - already validated by facade)
  // =========================================================================

  /**
   * Returns the frozen limits object.
   * Safe to return directly - mutations will throw in strict mode.
   */
  get(): Readonly<LimitsConfig> {
    return this.#limits;
  }

  /**
   * Gets a single limit value.
   * Input already validated by facade.
   *
   * @param limitName - Already validated by facade
   */
  getLimit<K extends keyof LimitsConfig>(limitName: K): LimitsConfig[K] {
    return this.#limits[limitName];
  }
}
