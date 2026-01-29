// packages/core/src/namespaces/RouteLifecycleNamespace/RouteLifecycleNamespace.ts

import { logger } from "@real-router/logger";
import { isBoolean, getTypeDescription } from "type-guards";

import { LIFECYCLE_LIMITS } from "./constants";
import {
  validateHandler,
  validateHandlerLimit,
  validateNotRegistering,
} from "./validators";

import type { RouteLifecycleDependencies } from "./types";
import type { Router } from "../../Router";
import type { ActivationFnFactory } from "../../types";
import type { ActivationFn, DefaultDependencies } from "@real-router/types";

/**
 * Converts a boolean value to an activation function factory.
 * Used for the shorthand syntax where true/false is passed instead of a function.
 */
function booleanToFactory<Dependencies extends DefaultDependencies>(
  value: boolean,
): ActivationFnFactory<Dependencies> {
  const activationFn: ActivationFn = () => value;

  return () => activationFn;
}

/**
 * Independent namespace for managing route lifecycle handlers.
 *
 * Static methods handle validation (called by facade).
 * Instance methods handle storage and business logic.
 */
export class RouteLifecycleNamespace<
  Dependencies extends DefaultDependencies = DefaultDependencies,
> {
  readonly #canDeactivateFactories = new Map<
    string,
    ActivationFnFactory<Dependencies>
  >();
  readonly #canActivateFactories = new Map<
    string,
    ActivationFnFactory<Dependencies>
  >();
  readonly #canDeactivateFunctions = new Map<string, ActivationFn>();
  readonly #canActivateFunctions = new Map<string, ActivationFn>();

  // Track routes currently being registered to prevent self-modification
  readonly #registering = new Set<string>();

  // Router reference for factory compilation (passed to lifecycle factories)
  #router: Router<Dependencies> | undefined;

  // Dependencies injected via setDependencies (for internal operations)
  #deps: RouteLifecycleDependencies<Dependencies> | undefined;

  // =========================================================================
  // Static validation methods (called by facade before instance methods)
  // Proxy to functions in validators.ts for separation of concerns
  // =========================================================================

  static validateHandler<D extends DefaultDependencies>(
    handler: unknown,
    methodName: string,
  ): asserts handler is ActivationFnFactory<D> | boolean {
    validateHandler<D>(handler, methodName);
  }

  static validateNotRegistering(
    isRegistering: boolean,
    name: string,
    methodName: string,
  ): void {
    validateNotRegistering(isRegistering, name, methodName);
  }

  static validateHandlerLimit(currentCount: number, methodName: string): void {
    validateHandlerLimit(currentCount, methodName);
  }

  // =========================================================================
  // Dependency injection
  // =========================================================================

  /**
   * Sets the router reference for factory compilation.
   * Lifecycle factories receive the router object directly as part of their API.
   */
  setRouter(router: Router<Dependencies>): void {
    this.#router = router;
  }

  /**
   * Sets dependencies for internal operations.
   * These replace direct method calls on router.
   */
  setDependencies(deps: RouteLifecycleDependencies<Dependencies>): void {
    this.#deps = deps;
  }

  // =========================================================================
  // State accessors (for facade validation)
  // =========================================================================

  /**
   * Returns true if route is currently being registered.
   * Used by facade for self-modification validation.
   */
  isRegistering(name: string): boolean {
    return this.#registering.has(name);
  }

  /**
   * Returns the number of canActivate handlers.
   * Used by facade for limit validation.
   */
  countCanActivate(): number {
    return this.#canActivateFactories.size;
  }

  /**
   * Returns the number of canDeactivate handlers.
   * Used by facade for limit validation.
   */
  countCanDeactivate(): number {
    return this.#canDeactivateFactories.size;
  }

  /**
   * Returns true if canActivate handler exists for route.
   * Used by facade to determine if this is an overwrite.
   */
  hasCanActivate(name: string): boolean {
    return this.#canActivateFactories.has(name);
  }

  /**
   * Returns true if canDeactivate handler exists for route.
   * Used by facade to determine if this is an overwrite.
   */
  hasCanDeactivate(name: string): boolean {
    return this.#canDeactivateFactories.has(name);
  }

  // =========================================================================
  // Instance methods (trust input - already validated by facade)
  // =========================================================================

  /**
   * Registers a canActivate guard for a route.
   * Input already validated by facade (not registering, limit).
   *
   * @param name - Route name (already validated by facade)
   * @param handler - Guard function or boolean (already validated)
   * @param isOverwrite - True if overwriting existing handler (computed by facade)
   */
  registerCanActivate(
    name: string,
    handler: ActivationFnFactory<Dependencies> | boolean,
    isOverwrite: boolean,
  ): void {
    this.#registerHandler(
      "activate",
      name,
      handler,
      this.#canActivateFactories,
      this.#canActivateFunctions,
      "canActivate",
      isOverwrite,
    );
  }

  /**
   * Registers a canDeactivate guard for a route.
   * Input already validated by facade (not registering, limit).
   *
   * @param name - Route name (already validated by facade)
   * @param handler - Guard function or boolean (already validated)
   * @param isOverwrite - True if overwriting existing handler (computed by facade)
   */
  registerCanDeactivate(
    name: string,
    handler: ActivationFnFactory<Dependencies> | boolean,
    isOverwrite: boolean,
  ): void {
    this.#registerHandler(
      "deactivate",
      name,
      handler,
      this.#canDeactivateFactories,
      this.#canDeactivateFunctions,
      "canDeactivate",
      isOverwrite,
    );
  }

  /**
   * Removes a canActivate guard for a route.
   * Input already validated by facade (not registering).
   *
   * @param name - Route name (already validated by facade)
   * @param silent - If true, suppresses warning when no handler exists
   */
  clearCanActivate(name: string, silent = false): void {
    const factoryDeleted = this.#canActivateFactories.delete(name);
    const functionDeleted = this.#canActivateFunctions.delete(name);

    if (!silent && !factoryDeleted && !functionDeleted) {
      logger.warn(
        "router.clearCanActivate",
        `No canActivate handler found for route "${name}"`,
      );
    }
  }

  /**
   * Removes a canDeactivate guard for a route.
   * Input already validated by facade (not registering).
   *
   * @param name - Route name (already validated by facade)
   * @param silent - If true, suppresses warning when no handler exists
   */
  clearCanDeactivate(name: string, silent = false): void {
    const factoryDeleted = this.#canDeactivateFactories.delete(name);
    const functionDeleted = this.#canDeactivateFunctions.delete(name);

    if (!silent && !factoryDeleted && !functionDeleted) {
      logger.warn(
        "router.clearCanDeactivate",
        `No canDeactivate handler found for route "${name}"`,
      );
    }
  }

  /**
   * Clears all lifecycle handlers (canActivate and canDeactivate).
   * Used by clearRoutes to reset all lifecycle state.
   */
  clearAll(): void {
    this.#canActivateFactories.clear();
    this.#canActivateFunctions.clear();
    this.#canDeactivateFactories.clear();
    this.#canDeactivateFunctions.clear();
  }

  /**
   * Returns lifecycle factories as records for cloning.
   *
   * @returns Tuple of [canDeactivateFactories, canActivateFactories]
   */
  getFactories(): [
    Record<string, ActivationFnFactory<Dependencies>>,
    Record<string, ActivationFnFactory<Dependencies>>,
  ] {
    const deactivateRecord: Record<
      string,
      ActivationFnFactory<Dependencies>
    > = {};
    const activateRecord: Record<
      string,
      ActivationFnFactory<Dependencies>
    > = {};

    for (const [name, factory] of this.#canDeactivateFactories) {
      deactivateRecord[name] = factory;
    }

    for (const [name, factory] of this.#canActivateFactories) {
      activateRecord[name] = factory;
    }

    return [deactivateRecord, activateRecord];
  }

  /**
   * Returns compiled lifecycle functions for transition execution.
   *
   * @returns Tuple of [canDeactivateFunctions, canActivateFunctions] as Maps
   */
  getFunctions(): [Map<string, ActivationFn>, Map<string, ActivationFn>] {
    return [this.#canDeactivateFunctions, this.#canActivateFunctions];
  }

  // =========================================================================
  // Private methods (business logic)
  // =========================================================================

  /**
   * Registers a handler. Input already validated by facade.
   * Handles overwrite warning, count threshold warnings, and factory compilation.
   */
  #registerHandler(
    type: "activate" | "deactivate",
    name: string,
    handler: ActivationFnFactory<Dependencies> | boolean,
    factories: Map<string, ActivationFnFactory<Dependencies>>,
    functions: Map<string, ActivationFn>,
    methodName: string,
    isOverwrite: boolean,
  ): void {
    // Emit warnings (validation done by facade)
    if (isOverwrite) {
      logger.warn(
        `router.${methodName}`,
        `Overwriting existing ${type} handler for route "${name}"`,
      );
    } else {
      this.#checkCountThresholds(factories.size + 1, methodName);
    }

    // Convert boolean to factory if needed
    const factory = isBoolean(handler)
      ? booleanToFactory<Dependencies>(handler)
      : handler;

    // Store factory
    factories.set(name, factory);

    // Mark route as being registered before calling user factory
    this.#registering.add(name);

    try {
      // Router and deps are guaranteed to be set at this point
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const router = this.#router!;
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const deps = this.#deps!;

      // Lifecycle factories receive full router as part of their public API
      const fn = factory(router, deps.getDependency);

      if (typeof fn !== "function") {
        throw new TypeError(
          `[router.${methodName}] Factory must return a function, got ${getTypeDescription(fn)}`,
        );
      }

      functions.set(name, fn);
    } catch (error) {
      // Rollback on failure to maintain consistency
      factories.delete(name);

      throw error;
    } finally {
      this.#registering.delete(name);
    }
  }

  /**
   * Emits warnings for count thresholds.
   * Validation (HARD_LIMIT) is done by facade.
   */
  #checkCountThresholds(currentSize: number, methodName: string): void {
    if (currentSize >= LIFECYCLE_LIMITS.ERROR) {
      logger.error(
        `router.${methodName}`,
        `${currentSize} lifecycle handlers registered! ` +
          `This is excessive. Hard limit at ${LIFECYCLE_LIMITS.HARD_LIMIT}.`,
      );
    } else if (currentSize >= LIFECYCLE_LIMITS.WARN) {
      logger.warn(
        `router.${methodName}`,
        `${currentSize} lifecycle handlers registered. ` +
          `Consider consolidating logic.`,
      );
    }
  }
}
