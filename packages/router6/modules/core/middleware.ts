// packages/real-router/modules/core/middleware.ts

import { getTypeDescription } from "../helpers";

import type {
  Unsubscribe,
  DefaultDependencies,
  Middleware,
  MiddlewareFactory,
  Router,
} from "router6-types";

/**
 * Gets a displayable name for a factory function.
 * Returns "anonymous" for arrow functions or unnamed functions.
 */
// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
function getFactoryName(factory: Function): string {
  if (factory.name) {
    return factory.name;
  }

  return "anonymous";
}

/**
 * Middleware registry limits to prevent memory leaks and architectural issues.
 * Based on practical experience with production routers.
 */
const MIDDLEWARE_LIMITS = {
  WARN: 15, // Log warning - consider refactoring
  ERROR: 30, // Log error - architectural problem
  HARD_LIMIT: 50, // Throw error - critical issue
} as const;

/**
 * Validates that a value is a valid middleware factory function.
 * Provides clear error messages for debugging.
 *
 * @param middlewareFactory - Value to validate
 * @param index - Position in the array for better error messages
 * @throws {TypeError} If the value is not a function
 */
function validateMiddlewareFactory<Dependencies extends DefaultDependencies>(
  middlewareFactory: unknown,
  index: number,
): asserts middlewareFactory is MiddlewareFactory<Dependencies> {
  if (typeof middlewareFactory !== "function") {
    throw new TypeError(
      `[router.useMiddleware] Expected middleware factory function at index ${index}, ` +
        `got ${getTypeDescription(middlewareFactory)}`,
    );
  }
}

/**
 * Validates that a middleware factory returned a valid middleware function.
 * Runtime protection against incorrect middleware implementations.
 *
 * @param middleware - Return value from middleware factory
 * @param factory - The factory that produced this middleware (for error context)
 * @throws {TypeError} If the middleware is not a function
 */
function validateMiddleware<Dependencies extends DefaultDependencies>(
  middleware: unknown,
  factory: MiddlewareFactory<Dependencies>,
): asserts middleware is Middleware {
  if (typeof middleware !== "function") {
    throw new TypeError(
      `[router.useMiddleware] Middleware factory must return a function, ` +
        `got ${getTypeDescription(middleware)}. ` +
        `Factory: ${getFactoryName(factory)}`,
    );
  }
}

/**
 * Checks the total middleware count and emits warnings/errors based on thresholds.
 * Prevents memory leaks and architectural degradation.
 *
 * @param newCount - Number of middleware to be added
 * @param currentSize - Current number of registered middleware
 * @throws {Error} If adding would exceed hard limit
 */
function validateMiddlewareCount(newCount: number, currentSize: number): void {
  const totalSize = newCount + currentSize;

  // Hard limit check - fail fast to prevent memory issues
  if (totalSize > MIDDLEWARE_LIMITS.HARD_LIMIT) {
    throw new Error(
      `[router.useMiddleware] Middleware limit exceeded (${MIDDLEWARE_LIMITS.HARD_LIMIT}). ` +
        `Current: ${currentSize}, Attempting to add: ${newCount}. ` +
        `This indicates an architectural problem. Consider consolidating middleware.`,
    );
  }

  // Graduated warnings for early problem detection
  if (totalSize >= MIDDLEWARE_LIMITS.ERROR) {
    console.error(
      "router.useMiddleware",
      `${totalSize} middleware registered! ` +
        `This is excessive and will impact performance. ` +
        `Hard limit at ${MIDDLEWARE_LIMITS.HARD_LIMIT}.`,
    );
  } else if (totalSize >= MIDDLEWARE_LIMITS.WARN) {
    console.warn(
      "router.useMiddleware",
      `${totalSize} middleware registered. ` + `Consider if all are necessary.`,
    );
  }
}

/**
 * Adds middleware capabilities to a router instance.
 * Middleware functions are executed during navigation transitions.
 *
 * Design decisions:
 * - Uses Set for O(1) duplicate detection and removal
 * - Maintains Map for factory->function mapping
 * - Preserves insertion order (important for middleware chain)
 * - Atomic operations with rollback on failure
 * - Prevents duplicate registrations
 *
 * @param router - Router instance to enhance
 * @returns Enhanced router with middleware methods
 */
export function withMiddleware<Dependencies extends DefaultDependencies>(
  router: Router<Dependencies>,
): Router<Dependencies> {
  // Use Set for efficient O(1) operations and automatic deduplication
  const middlewareFactories = new Set<MiddlewareFactory<Dependencies>>();

  // Map factories to their produced middleware for efficient lookup
  const factoryToMiddleware = new Map<
    MiddlewareFactory<Dependencies>,
    Middleware
  >();

  /**
   * Registers one or more middleware factories with the router.
   * Middleware are executed in order during navigation transitions.
   *
   * @param passedMiddlewareFactories - Factory functions that create middleware
   * @returns Unsubscribe function to remove all added middleware
   * @throws {TypeError} If any factory is not a function
   * @throws {Error} If factory is already registered or limit exceeded
   *
   * @example
   * const unsubscribe = router.useMiddleware(
   *   authMiddleware,
   *   loggingMiddleware
   * );
   * // Later: unsubscribe() to remove both
   */
  router.useMiddleware = (
    ...passedMiddlewareFactories: MiddlewareFactory<Dependencies>[]
  ): Unsubscribe => {
    // Early validation before any state changes
    validateMiddlewareCount(
      passedMiddlewareFactories.length,
      middlewareFactories.size,
    );

    // Validate ALL factories first (atomicity principle)
    passedMiddlewareFactories.forEach((factory, index) => {
      validateMiddlewareFactory<Dependencies>(factory, index);

      // Prevent duplicate registrations to avoid confusion
      if (middlewareFactories.has(factory)) {
        throw new Error(
          `[router.useMiddleware] Middleware factory already registered. ` +
            `To re-register, first unsubscribe the existing middleware. ` +
            `Factory: ${getFactoryName(factory)}`,
        );
      }
    });

    // Track successfully initialized middleware for potential rollback
    const initialized: {
      factory: MiddlewareFactory<Dependencies>;
      middleware: Middleware;
    }[] = [];

    // Initialize phase with rollback capability
    try {
      for (const factory of passedMiddlewareFactories) {
        // Create middleware instance with router context
        const middleware = factory(router, router.getDependency);

        // Validate the produced middleware
        validateMiddleware<Dependencies>(middleware, factory);

        initialized.push({ factory, middleware });
      }
    } catch (error) {
      // Rollback: Clean up any successfully initialized middleware
      // This ensures atomicity - either all succeed or none are registered
      console.error(
        "router.useMiddleware",
        "Failed to initialize middleware, rolling back",
        error,
      );

      // No cleanup needed as we haven't modified state yet
      throw error;
    }

    // Commit phase: All validations passed, update state atomically
    for (const { factory, middleware } of initialized) {
      middlewareFactories.add(factory);
      factoryToMiddleware.set(factory, middleware);
    }

    // Return unsubscribe function specific to THIS call's middleware
    return (): void => {
      // Remove only the middleware added in THIS specific call
      for (const { factory } of initialized) {
        const wasDeleted = middlewareFactories.delete(factory);

        if (!wasDeleted) {
          // This shouldn't happen but log for debugging
          console.warn(
            "router.useMiddleware",
            `Attempted to remove non-existent middleware factory. ` +
              `This might indicate a memory leak or incorrect cleanup logic.`,
          );
        }

        // Clean up the mapping
        factoryToMiddleware.delete(factory);
      }
    };
  };

  /**
   * Removes all registered middleware from the router.
   * Useful for testing or complete router reset.
   *
   * @returns The router instance for chaining
   */
  router.clearMiddleware = (): Router<Dependencies> => {
    // Clear both collections efficiently
    middlewareFactories.clear();
    factoryToMiddleware.clear();

    return router;
  };

  /**
   * Returns a copy of registered middleware factories.
   * Preserves insertion order (important for middleware chain).
   *
   * @internal Used by router.clone(). Will be removed from public API.
   * @deprecated Use behavior testing instead of checking internal state
   * @returns Array of middleware factories in registration order
   */
  router.getMiddlewareFactories = (): MiddlewareFactory<Dependencies>[] => {
    // Return a copy to prevent external mutations
    // Set iterator preserves insertion order (ES2015 guarantee)
    return [...middlewareFactories];
  };

  /**
   * Returns the actual middleware functions in execution order.
   * Used internally by the transition system.
   *
   * @internal Used by transition execution. Not part of public API.
   * @returns Array of middleware functions ready for execution
   */
  router.getMiddlewareFunctions = (): Middleware[] => {
    // Return middleware functions in insertion order
    // Map preserves insertion order (ES2015 guarantee)
    return [...factoryToMiddleware.values()];
  };

  return router;
}
