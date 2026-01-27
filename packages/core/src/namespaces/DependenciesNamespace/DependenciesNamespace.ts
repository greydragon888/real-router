// packages/core/src/namespaces/DependenciesNamespace/DependenciesNamespace.ts

import { logger } from "@real-router/logger";

import { DEPENDENCY_LIMITS } from "./constants";
import { getTypeDescription } from "../../helpers";

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
  // =========================================================================

  /**
   * Validates that dependency name is a string.
   * Called by facade before set/get operations.
   */
  static validateName(
    name: unknown,
    methodName: string,
  ): asserts name is string {
    if (typeof name !== "string") {
      throw new TypeError(
        `[router.${methodName}]: dependency name must be a string, got ${typeof name}`,
      );
    }
  }

  /**
   * Validates that dependencies object is a plain object without getters.
   * Called by facade before setMultiple/constructor.
   */
  static validateDependenciesObject(
    deps: unknown,
    methodName: string,
  ): asserts deps is Record<string, unknown> {
    // Reject non-plain objects (classes, Date, Map, Array)
    if (!(deps && typeof deps === "object" && deps.constructor === Object)) {
      throw new TypeError(
        `[router.${methodName}] Invalid argument: expected plain object, received ${getTypeDescription(deps)}`,
      );
    }

    // Getters can throw, return different values, or have side effects
    for (const key in deps) {
      if (Object.getOwnPropertyDescriptor(deps, key)?.get) {
        throw new TypeError(
          `[router.${methodName}] Getters not allowed: "${key}"`,
        );
      }
    }
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
   * Performs atomic limit check - either all set or none.
   *
   * @param deps - Already validated by facade
   */
  setMultiple(deps: Partial<Dependencies>): void {
    // Atomic limit check - either all set or none
    const totalCount =
      Object.keys(this.#dependencies).length + Object.keys(deps).length;

    if (totalCount >= DEPENDENCY_LIMITS.HARD_LIMIT) {
      throw new Error(
        `[router.setDependencies] Dependency limit exceeded (${DEPENDENCY_LIMITS.HARD_LIMIT}). ` +
          `Current: ${totalCount}. This is likely a bug in your code.`,
      );
    }

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
    const dependency = this.#dependencies[dependencyName];

    if (dependency === undefined) {
      throw new ReferenceError(
        `[router.getDependency]: dependency "${String(dependencyName)}" not found`,
      );
    }

    return dependency;
  }

  /**
   * Gets all dependencies as a shallow copy.
   */
  getAll(): Partial<Dependencies> {
    return { ...this.#dependencies };
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
