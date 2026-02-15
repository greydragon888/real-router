// packages/core/src/namespaces/OptionsNamespace/OptionsNamespace.ts

import { defaultOptions } from "./constants";
import { deepFreeze } from "./helpers";
import { validateOptions } from "./validators";

import type { Options } from "@real-router/types";

/**
 * Independent namespace for managing router options.
 *
 * Options are immutable after construction.
 * Static methods handle validation (called by facade).
 * Instance methods provide read-only access.
 */
export class OptionsNamespace {
  readonly #options: Readonly<Options>;

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

  static validateOptions(
    options: unknown,
    methodName: string,
  ): asserts options is Partial<Options> {
    validateOptions(options, methodName);
  }

  // =========================================================================
  // Instance methods (read-only access)
  // =========================================================================

  /**
   * Returns the frozen options object.
   * Safe to return directly - mutations will throw in strict mode.
   */
  get(): Readonly<Options> {
    return this.#options;
  }
}
