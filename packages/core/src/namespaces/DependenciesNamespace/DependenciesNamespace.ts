// packages/core/src/namespaces/DependenciesNamespace/DependenciesNamespace.ts

import { logger } from "@real-router/logger";
import { getTypeDescription } from "type-guards";

import { DEPENDENCY_LIMITS } from "./constants";
import {
  validateDependencyExists,
  validateDependencyLimit,
  validateDependencyName,
  validateDependenciesObject,
  validateSetDependencyArgs,
} from "./validators";

import type { DefaultDependencies } from "@real-router/types";

/**
 * Independent namespace for managing router dependencies.
 *
 * Static methods handle validation (called by facade).
 * Instance methods handle storage and business logic (limits, warnings).
 */
export class DependenciesNamespace<
  Dependencies extends DefaultDependencies = DefaultDependencies,
> {
  // Null-prototype object to avoid prototype pollution
  readonly #dependencies: Partial<Dependencies> = Object.create(
    null,
  ) as Partial<Dependencies>;

  constructor(initialDependencies: Partial<Dependencies> = {} as Dependencies) {
    // Note: validation should be done by facade before calling constructor
    this.setMultiple(initialDependencies);
  }

  // =========================================================================
  // Static validation methods (called by facade before instance methods)
  // Proxy to functions in validators.ts for separation of concerns
  // =========================================================================

  static validateName(
    name: unknown,
    methodName: string,
  ): asserts name is string {
    validateDependencyName(name, methodName);
  }

  static validateSetDependencyArgs(name: unknown): asserts name is string {
    validateSetDependencyArgs(name);
  }

  static validateDependenciesObject(
    deps: unknown,
    methodName: string,
  ): asserts deps is Record<string, unknown> {
    validateDependenciesObject(deps, methodName);
  }

  static validateDependencyExists(
    value: unknown,
    dependencyName: string,
  ): asserts value is NonNullable<unknown> {
    validateDependencyExists(value, dependencyName);
  }

  static validateDependencyLimit(
    currentCount: number,
    newCount: number,
    methodName: string,
  ): void {
    validateDependencyLimit(currentCount, newCount, methodName);
  }

  // =========================================================================
  // Instance methods (trust input - already validated by facade)
  // =========================================================================

  /**
   * Sets a single dependency.
   * Returns true if set, false if value was undefined (no-op).
   *
   * @param dependencyName - Already validated by facade
   * @param dependencyValue - Value to set
   */
  set<K extends keyof Dependencies & string>(
    dependencyName: K,
    dependencyValue: Dependencies[K],
  ): boolean {
    // undefined = "don't set" (feature for conditional setting)
    if (dependencyValue === undefined) {
      return false;
    }

    const isNewKey = !Object.hasOwn(this.#dependencies, dependencyName);

    if (isNewKey) {
      // Only check limit when adding new keys (overwrites don't increase count)
      this.#checkDependencyCount("setDependency");
    } else {
      const oldValue = this.#dependencies[dependencyName];
      const isChanging = oldValue !== dependencyValue;
      // Special case for NaN idempotency (NaN !== NaN is always true)
      const bothAreNaN =
        Number.isNaN(oldValue) && Number.isNaN(dependencyValue);

      if (isChanging && !bothAreNaN) {
        logger.warn(
          "router.setDependency",
          "Router dependency already exists and is being overwritten:",
          dependencyName,
        );
      }
    }

    this.#dependencies[dependencyName] = dependencyValue;

    return true;
  }

  /**
   * Sets multiple dependencies at once.
   * Limit check should be done by facade before calling this method.
   *
   * @param deps - Already validated by facade
   */
  setMultiple(deps: Partial<Dependencies>): void {
    const overwrittenKeys: string[] = [];

    for (const key in deps) {
      if (deps[key] !== undefined) {
        if (Object.hasOwn(this.#dependencies, key)) {
          overwrittenKeys.push(key);
        }

        this.#dependencies[key] = deps[key];
      }
    }

    if (overwrittenKeys.length > 0) {
      logger.warn(
        "router.setDependencies",
        "Overwritten:",
        overwrittenKeys.join(", "),
      );
    }
  }

  /**
   * Gets a single dependency.
   * Throws if not found.
   *
   * @param dependencyName - Already validated by facade
   */
  get<K extends keyof Dependencies>(dependencyName: K): Dependencies[K] {
    return this.#dependencies[dependencyName] as Dependencies[K];
  }

  /**
   * Gets all dependencies as a shallow copy.
   */
  getAll(): Partial<Dependencies> {
    return { ...this.#dependencies };
  }

  /**
   * Gets the current number of dependencies.
   */
  count(): number {
    return Object.keys(this.#dependencies).length;
  }

  /**
   * Removes a dependency by name.
   * Logs warning if dependency doesn't exist.
   */
  remove(dependencyName: keyof Dependencies): void {
    if (!Object.hasOwn(this.#dependencies, dependencyName)) {
      logger.warn(
        `router.removeDependency`,
        `Attempted to remove non-existent dependency: "${getTypeDescription(dependencyName)}"`,
      );
    }

    delete this.#dependencies[dependencyName];
  }

  /**
   * Checks if a dependency exists.
   */
  has(dependencyName: keyof Dependencies): boolean {
    return Object.hasOwn(this.#dependencies, dependencyName);
  }

  /**
   * Removes all dependencies.
   */
  reset(): void {
    for (const key in this.#dependencies) {
      delete this.#dependencies[key];
    }
  }

  // =========================================================================
  // Private methods (business logic)
  // =========================================================================

  #checkDependencyCount(methodName: string): void {
    const currentCount = Object.keys(this.#dependencies).length;

    if (currentCount === DEPENDENCY_LIMITS.WARN) {
      logger.warn(
        `router.${methodName}`,
        `${DEPENDENCY_LIMITS.WARN} dependencies registered. ` +
          `Consider if all are necessary.`,
      );
    } else if (currentCount === DEPENDENCY_LIMITS.ERROR) {
      logger.error(
        `router.${methodName}`,
        `${DEPENDENCY_LIMITS.ERROR} dependencies registered! ` +
          `This indicates architectural problems. ` +
          `Hard limit at ${DEPENDENCY_LIMITS.HARD_LIMIT}.`,
      );
    } else if (currentCount >= DEPENDENCY_LIMITS.HARD_LIMIT) {
      throw new Error(
        `[router.${methodName}] Dependency limit exceeded (${DEPENDENCY_LIMITS.HARD_LIMIT}). ` +
          `Current: ${currentCount}. This is likely a bug in your code. ` +
          `If you genuinely need more dependencies, your architecture needs refactoring.`,
      );
    }
  }
}
