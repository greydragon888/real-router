// packages/real-router/modules/core/routeLifecycle.ts

import { isBoolean, validateRouteName } from "type-guards";

import { getTypeDescription } from "../helpers";

import type {
  ActivationFn,
  ActivationFnFactory,
  DefaultDependencies,
  Router,
} from "router6-types";

/**
 * Lifecycle handler registry limits to prevent memory leaks.
 * Higher limits than middleware since routes can be numerous.
 */
const LIFECYCLE_LIMITS = {
  WARN: 50, // Log warning - review route structure
  ERROR: 100, // Log error - too many routes with handlers
  HARD_LIMIT: 200, // Throw error - critical architectural issue
} as const;

/**
 * Validates that a handler is either a boolean or a factory function.
 *
 * @param handler - Value to validate
 * @param methodName - Calling method for error context
 * @throws {TypeError} If handler is not valid
 */
function validateHandler<Dependencies extends DefaultDependencies>(
  handler: unknown,
  methodName: string,
): asserts handler is ActivationFnFactory<Dependencies> | boolean {
  if (!isBoolean(handler) && typeof handler !== "function") {
    throw new TypeError(
      `[router.${methodName}] Handler must be a boolean or factory function, ` +
        `got ${getTypeDescription(handler)}`,
    );
  }
}

/**
 * Checks the total handler count and emits warnings based on thresholds.
 * Prevents memory leaks from excessive route handlers.
 *
 * @param currentSize - Current number of registered handlers
 * @param methodName - Calling method for error context
 * @throws {Error} If limit is exceeded
 */
function checkHandlerCount(currentSize: number, methodName: string): void {
  if (currentSize >= LIFECYCLE_LIMITS.HARD_LIMIT) {
    throw new Error(
      `[router.${methodName}] Lifecycle handler limit exceeded (${LIFECYCLE_LIMITS.HARD_LIMIT}). ` +
        `This indicates too many routes with individual handlers. ` +
        `Consider using middleware for cross-cutting concerns.`,
    );
  }

  if (currentSize >= LIFECYCLE_LIMITS.ERROR) {
    console.error(
      `[router.${methodName}] ${currentSize} lifecycle handlers registered! ` +
        `This is excessive. Hard limit at ${LIFECYCLE_LIMITS.HARD_LIMIT}.`,
    );
  } else if (currentSize >= LIFECYCLE_LIMITS.WARN) {
    console.warn(
      `[router.${methodName}] ${currentSize} lifecycle handlers registered. ` +
        `Consider consolidating logic.`,
    );
  }
}

/**
 * Converts a boolean value to an activation function factory.
 * Used for the shorthand syntax where true/false is passed instead of a function.
 *
 * Design note: Creates a factory that returns a function returning the boolean.
 * This maintains consistency with the factory pattern used throughout.
 *
 * @param value - Boolean value to convert
 * @returns Factory function that produces an activation function
 */
function booleanToFactory<Dependencies extends DefaultDependencies>(
  value: boolean,
): ActivationFnFactory<Dependencies> {
  // Cache the activation function to avoid recreating it
  const activationFn: ActivationFn = () => value;

  return () => activationFn;
}

/**
 * Adds route lifecycle capabilities to a router instance.
 * Allows registration of canActivate and canDeactivate guards for routes.
 *
 * Design decisions:
 * - Uses Map for O(1) operations and better memory management
 * - Separate Maps for factories and compiled functions
 * - Supports both boolean shortcuts and factory functions
 * - Warns on overwrites to prevent silent failures
 * - Enforces limits to prevent architectural degradation
 *
 * @param router - Router instance to enhance
 * @returns Enhanced router with lifecycle methods
 */
export function withRouteLifecycle<
  Dependencies extends DefaultDependencies = DefaultDependencies,
>(router: Router<Dependencies>): Router<Dependencies> {
  // Use Map for efficient O(1) operations
  // Separate storage for factories (source) and functions (compiled)
  const canDeactivateFactories = new Map<
    string,
    ActivationFnFactory<Dependencies>
  >();
  const canActivateFactories = new Map<
    string,
    ActivationFnFactory<Dependencies>
  >();
  const canDeactivateFunctions = new Map<string, ActivationFn>();
  const canActivateFunctions = new Map<string, ActivationFn>();

  // Track routes currently being registered to prevent self-modification
  // This prevents desynchronization between factories and functions Maps
  const registering = new Set<string>();

  /**
   * Internal helper to register a lifecycle handler.
   * Centralizes the logic for both canActivate and canDeactivate.
   *
   * @param type - Type of handler ('activate' or 'deactivate')
   * @param name - Route name
   * @param handler - Handler function or boolean
   * @param factories - Map to store factories
   * @param functions - Map to store compiled functions
   * @param methodName - Method name for error messages
   */
  function registerHandler(
    type: "activate" | "deactivate",
    name: string,
    handler: ActivationFnFactory<Dependencies> | boolean,
    factories: Map<string, ActivationFnFactory<Dependencies>>,
    functions: Map<string, ActivationFn>,
    methodName: string,
  ): void {
    // Prevent self-modification during factory compilation
    // This ensures factories and functions Maps stay synchronized
    if (registering.has(name)) {
      throw new Error(
        `[router.${methodName}] Cannot modify route "${name}" during its own registration`,
      );
    }

    const isOverwrite = factories.has(name);

    if (isOverwrite) {
      // Warn about overwrites for debugging
      console.warn(
        `[router.${methodName}] Overwriting existing ${type} handler for route "${name}"`,
      );
    } else {
      // Check limit only for new handlers
      checkHandlerCount(factories.size + 1, methodName);
    }

    // Convert boolean to factory if needed
    const factory = isBoolean(handler)
      ? booleanToFactory<Dependencies>(handler)
      : handler;

    // Store factory
    factories.set(name, factory);

    // Mark route as being registered before calling user factory
    registering.add(name);

    // Compile and cache the function immediately
    // This validates the factory early and improves runtime performance
    try {
      const fn = factory(router, router.getDependency);

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
      // Always remove from registering set
      registering.delete(name);
    }
  }

  /**
   * Returns lifecycle factories for cloning.
   *
   * @internal Used by router.clone(). Not part of public API.
   * @returns Tuple of [canDeactivateFactories, canActivateFactories]
   */
  router.getLifecycleFactories = (): [
    Record<string, ActivationFnFactory<Dependencies>>,
    Record<string, ActivationFnFactory<Dependencies>>,
  ] => {
    // Convert Maps to Records for backward compatibility
    // Note: This creates a snapshot, not a live reference
    const deactivateRecord: Record<
      string,
      ActivationFnFactory<Dependencies>
    > = {};
    const activateRecord: Record<
      string,
      ActivationFnFactory<Dependencies>
    > = {};

    for (const [name, factory] of canDeactivateFactories) {
      deactivateRecord[name] = factory;
    }

    for (const [name, factory] of canActivateFactories) {
      activateRecord[name] = factory;
    }

    return [deactivateRecord, activateRecord];
  };

  /**
   * Returns compiled lifecycle functions for transition execution.
   * Returns Maps directly for O(1) operations without Object.fromEntries overhead.
   *
   * @internal Used by transition system. Not part of public API.
   * @returns Tuple of [canDeactivateFunctions, canActivateFunctions] as Maps
   */
  router.getLifecycleFunctions = () => [
    canDeactivateFunctions,
    canActivateFunctions,
  ];

  /**
   * Registers a canActivate guard for a route.
   * The guard is called before activating the route.
   *
   * @param name - Route name to guard
   * @param canActivateHandler - Guard function or boolean
   * @returns Router instance for chaining
   * @throws {TypeError} If name is not a string or handler is invalid
   * @throws {Error} If handler limit is exceeded
   *
   * @example
   * // Boolean shorthand
   * router.canActivate('admin', false); // Always deny
   *
   * @example
   * // Factory function
   * router.canActivate('profile', (router) => {
   *   return (toState, fromState, done) => {
   *     const isAuthenticated = router.getDependency('auth').isLoggedIn();
   *     done(isAuthenticated ? undefined : new Error('Not authenticated'));
   *   };
   * });
   */
  router.canActivate = (
    name: string,
    canActivateHandler: ActivationFnFactory<Dependencies> | boolean,
  ): Router<Dependencies> => {
    validateRouteName(name, "canActivate");
    validateHandler<Dependencies>(canActivateHandler, "canActivate");

    registerHandler(
      "activate",
      name,
      canActivateHandler,
      canActivateFactories,
      canActivateFunctions,
      "canActivate",
    );

    return router;
  };

  /**
   * Registers a canDeactivate guard for a route.
   * The guard is called before leaving the route.
   *
   * @param name - Route name to guard
   * @param canDeactivateHandler - Guard function or boolean
   * @returns Router instance for chaining
   * @throws {TypeError} If name is not a string or handler is invalid
   * @throws {Error} If handler limit is exceeded
   *
   * @example
   * // Prevent leaving with unsaved changes
   * router.canDeactivate('editor', (router) => {
   *   return (toState, fromState, done) => {
   *     if (hasUnsavedChanges()) {
   *       const confirmed = confirm('Discard unsaved changes?');
   *       done(confirmed ? undefined : new Error('User cancelled'));
   *     } else {
   *       done();
   *     }
   *   };
   * });
   */
  router.canDeactivate = (
    name: string,
    canDeactivateHandler: ActivationFnFactory<Dependencies> | boolean,
  ): Router<Dependencies> => {
    validateRouteName(name, "canDeactivate");
    validateHandler<Dependencies>(canDeactivateHandler, "canDeactivate");

    registerHandler(
      "deactivate",
      name,
      canDeactivateHandler,
      canDeactivateFactories,
      canDeactivateFunctions,
      "canDeactivate",
    );

    return router;
  };

  /**
   * Removes a canDeactivate guard for a route.
   * Used to clean up guards that are no longer needed.
   *
   * @param name - Route name to clear guard for
   * @param silent - If true, suppresses warning when no handler exists
   * @returns Router instance for chaining
   * @throws {TypeError} If name is not a string
   *
   * @example
   * router.clearCanDeactivate('editor');
   */
  router.clearCanDeactivate = (
    name: string,
    silent = false,
  ): Router<Dependencies> => {
    validateRouteName(name, "clearCanDeactivate");

    // Prevent clearing a route during its own registration
    if (registering.has(name)) {
      throw new Error(
        `[router.clearCanDeactivate] Cannot modify route "${name}" during its own registration`,
      );
    }

    const factoryDeleted = canDeactivateFactories.delete(name);
    const functionDeleted = canDeactivateFunctions.delete(name);

    if (!silent && !factoryDeleted && !functionDeleted) {
      console.warn(
        `[router.clearCanDeactivate] No canDeactivate handler found for route "${name}"`,
      );
    }

    return router;
  };

  /**
   * Removes a canActivate guard for a route.
   * Used to clean up guards that are no longer needed.
   *
   * @param name - Route name to clear guard for
   * @param silent - If true, suppresses warning when no handler exists
   * @returns Router instance for chaining
   * @throws {TypeError} If name is not a string
   *
   * @example
   * router.clearCanActivate('admin');
   */
  router.clearCanActivate = (
    name: string,
    silent = false,
  ): Router<Dependencies> => {
    validateRouteName(name, "clearCanActivate");

    // Prevent clearing a route during its own registration
    if (registering.has(name)) {
      throw new Error(
        `[router.clearCanActivate] Cannot modify route "${name}" during its own registration`,
      );
    }

    const factoryDeleted = canActivateFactories.delete(name);
    const functionDeleted = canActivateFunctions.delete(name);

    if (!silent && !factoryDeleted && !functionDeleted) {
      console.warn(
        `[router.clearCanActivate] No canActivate handler found for route "${name}"`,
      );
    }

    return router;
  };

  return router;
}
