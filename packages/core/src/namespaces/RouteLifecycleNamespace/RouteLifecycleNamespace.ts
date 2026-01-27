// packages/core/src/namespaces/RouteLifecycleNamespace/RouteLifecycleNamespace.ts

import { logger } from "@real-router/logger";
import { isBoolean } from "type-guards";

import { LIFECYCLE_LIMITS } from "./constants";
import { getTypeDescription } from "../../helpers";

import type {
  ActivationFn,
  ActivationFnFactory,
  DefaultDependencies,
  Router,
} from "@real-router/types";

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

  // Router reference for dependency injection (set after construction)
  #router: Router<Dependencies> | undefined;

  // =========================================================================
  // Static validation methods (called by facade before instance methods)
  // =========================================================================

  /**
   * Validates that a handler is either a boolean or a factory function.
   */
  static validateHandler<D extends DefaultDependencies>(
    handler: unknown,
    methodName: string,
  ): asserts handler is ActivationFnFactory<D> | boolean {
    if (!isBoolean(handler) && typeof handler !== "function") {
      throw new TypeError(
        `[router.${methodName}] Handler must be a boolean or factory function, ` +
          `got ${getTypeDescription(handler)}`,
      );
    }
  }

  // =========================================================================
  // Dependency injection
  // =========================================================================

  /**
   * Sets the router reference for factory compilation.
   * Must be called before registering any handlers.
   */
  setRouter(router: Router<Dependencies>): void {
    this.#router = router;
  }

  // =========================================================================
  // Instance methods (trust input - already validated by facade)
  // =========================================================================

  /**
   * Registers a canActivate guard for a route.
   *
   * @param name - Route name (already validated by facade)
   * @param handler - Guard function or boolean (already validated)
   */
  registerCanActivate(
    name: string,
    handler: ActivationFnFactory<Dependencies> | boolean,
  ): void {
    this.#registerHandler(
      "activate",
      name,
      handler,
      this.#canActivateFactories,
      this.#canActivateFunctions,
      "canActivate",
    );
  }

  /**
   * Registers a canDeactivate guard for a route.
   *
   * @param name - Route name (already validated by facade)
   * @param handler - Guard function or boolean (already validated)
   */
  registerCanDeactivate(
    name: string,
    handler: ActivationFnFactory<Dependencies> | boolean,
  ): void {
    this.#registerHandler(
      "deactivate",
      name,
      handler,
      this.#canDeactivateFactories,
      this.#canDeactivateFunctions,
      "canDeactivate",
    );
  }

  /**
   * Removes a canActivate guard for a route.
   *
   * @param name - Route name (already validated by facade)
   * @param silent - If true, suppresses warning when no handler exists
   */
  clearCanActivate(name: string, silent = false): void {
    if (this.#registering.has(name)) {
      throw new Error(
        `[router.clearCanActivate] Cannot modify route "${name}" during its own registration`,
      );
    }

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
   *
   * @param name - Route name (already validated by facade)
   * @param silent - If true, suppresses warning when no handler exists
   */
  clearCanDeactivate(name: string, silent = false): void {
    if (this.#registering.has(name)) {
      throw new Error(
        `[router.clearCanDeactivate] Cannot modify route "${name}" during its own registration`,
      );
    }

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

  #registerHandler(
    type: "activate" | "deactivate",
    name: string,
    handler: ActivationFnFactory<Dependencies> | boolean,
    factories: Map<string, ActivationFnFactory<Dependencies>>,
    functions: Map<string, ActivationFn>,
    methodName: string,
  ): void {
    // Prevent self-modification during factory compilation
    if (this.#registering.has(name)) {
      throw new Error(
        `[router.${methodName}] Cannot modify route "${name}" during its own registration`,
      );
    }

    const isOverwrite = factories.has(name);

    if (isOverwrite) {
      logger.warn(
        `router.${methodName}`,
        `Overwriting existing ${type} handler for route "${name}"`,
      );
    } else {
      this.#checkHandlerCount(factories.size + 1, methodName);
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
      // Bind getDependency to preserve 'this' context when called from factory

      const fn = factory(
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- always set by Router
        this.#router!,
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- always set by Router
        this.#router!.getDependency.bind(this.#router),
      );

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

  #checkHandlerCount(currentSize: number, methodName: string): void {
    if (currentSize >= LIFECYCLE_LIMITS.HARD_LIMIT) {
      throw new Error(
        `[router.${methodName}] Lifecycle handler limit exceeded (${LIFECYCLE_LIMITS.HARD_LIMIT}). ` +
          `This indicates too many routes with individual handlers. ` +
          `Consider using middleware for cross-cutting concerns.`,
      );
    }

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
