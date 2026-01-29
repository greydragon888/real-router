// packages/core/src/namespaces/MiddlewareNamespace/MiddlewareNamespace.ts

import { logger } from "@real-router/logger";
import { getTypeDescription } from "type-guards";

import { MIDDLEWARE_LIMITS } from "./constants";

import type { MiddlewareDependencies } from "./types";
import type { Router } from "../../Router";
import type { MiddlewareFactory } from "../../types";
import type {
  DefaultDependencies,
  Middleware,
  Unsubscribe,
} from "@real-router/types";

/**
 * Gets a displayable name for a factory function.
 */
// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
function getFactoryName(factory: Function): string {
  return factory.name || "anonymous";
}

/**
 * Independent namespace for managing middleware.
 *
 * Static methods handle validation (called by facade).
 * Instance methods handle storage and business logic.
 */
export class MiddlewareNamespace<
  Dependencies extends DefaultDependencies = DefaultDependencies,
> {
  readonly #factories = new Set<MiddlewareFactory<Dependencies>>();
  readonly #factoryToMiddleware = new Map<
    MiddlewareFactory<Dependencies>,
    Middleware
  >();

  // Router reference for middleware initialization (passed to middleware factories)
  #router: Router<Dependencies> | undefined;

  // Dependencies injected via setDependencies (for internal operations)
  #deps: MiddlewareDependencies<Dependencies> | undefined;

  // =========================================================================
  // Static validation methods (called by facade before instance methods)
  // =========================================================================

  /**
   * Validates useMiddleware arguments.
   */
  static validateUseMiddlewareArgs<D extends DefaultDependencies>(
    middlewares: unknown[],
  ): asserts middlewares is MiddlewareFactory<D>[] {
    for (const [i, middleware] of middlewares.entries()) {
      if (typeof middleware !== "function") {
        throw new TypeError(
          `[router.useMiddleware] Expected middleware factory function at index ${i}, ` +
            `got ${getTypeDescription(middleware)}`,
        );
      }
    }
  }

  /**
   * Validates that a middleware factory returned a valid middleware function.
   */
  static validateMiddleware<D extends DefaultDependencies>(
    middleware: unknown,
    factory: MiddlewareFactory<D>,
  ): asserts middleware is Middleware {
    if (typeof middleware !== "function") {
      throw new TypeError(
        `[router.useMiddleware] Middleware factory must return a function, ` +
          `got ${getTypeDescription(middleware)}. ` +
          `Factory: ${getFactoryName(factory)}`,
      );
    }
  }

  // =========================================================================
  // Dependency injection
  // =========================================================================

  /**
   * Sets the router reference for middleware initialization.
   * Middleware factories receive the router object directly as part of their API.
   */
  setRouter(router: Router<Dependencies>): void {
    this.#router = router;
  }

  /**
   * Sets dependencies for internal operations.
   * These replace direct method calls on router.
   */
  setDependencies(deps: MiddlewareDependencies<Dependencies>): void {
    this.#deps = deps;
  }

  // =========================================================================
  // Instance methods (trust input - already validated by facade)
  // =========================================================================

  /**
   * Registers one or more middleware factories.
   * Returns unsubscribe function to remove all added middleware.
   *
   * @param factories - Already validated by facade
   */
  use(...factories: MiddlewareFactory<Dependencies>[]): Unsubscribe {
    // Check limits
    this.#validateCount(factories.length);

    // Check for duplicates
    for (const factory of factories) {
      if (this.#factories.has(factory)) {
        throw new Error(
          `[router.useMiddleware] Middleware factory already registered. ` +
            `To re-register, first unsubscribe the existing middleware. ` +
            `Factory: ${getFactoryName(factory)}`,
        );
      }
    }

    // Track successfully initialized middleware for potential rollback
    const initialized: {
      factory: MiddlewareFactory<Dependencies>;
      middleware: Middleware;
    }[] = [];

    // Initialize phase with rollback capability
    try {
      for (const factory of factories) {
        // Router and deps are guaranteed to be set at this point
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const router = this.#router!;
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const deps = this.#deps!;

        // Middleware factories receive full router as part of their public API
        const middleware = factory(router, deps.getDependency);

        MiddlewareNamespace.validateMiddleware<Dependencies>(
          middleware,
          factory,
        );

        initialized.push({ factory, middleware });
      }
    } catch (error) {
      logger.error(
        "router.useMiddleware",
        "Failed to initialize middleware, rolling back",
        error,
      );

      throw error;
    }

    // Commit phase: update state atomically
    for (const { factory, middleware } of initialized) {
      this.#factories.add(factory);
      this.#factoryToMiddleware.set(factory, middleware);
    }

    // Return unsubscribe function specific to THIS call's middleware
    return (): void => {
      for (const { factory } of initialized) {
        const wasDeleted = this.#factories.delete(factory);

        if (!wasDeleted) {
          logger.warn(
            "router.useMiddleware",
            `Attempted to remove non-existent middleware factory. ` +
              `This might indicate a memory leak or incorrect cleanup logic.`,
          );
        }

        this.#factoryToMiddleware.delete(factory);
      }
    };
  }

  /**
   * Removes all registered middleware.
   */
  clear(): void {
    this.#factories.clear();
    this.#factoryToMiddleware.clear();
  }

  /**
   * Returns a copy of registered middleware factories.
   * Preserves insertion order.
   */
  getFactories(): MiddlewareFactory<Dependencies>[] {
    return [...this.#factories];
  }

  /**
   * Returns the actual middleware functions in execution order.
   */
  getFunctions(): Middleware[] {
    return [...this.#factoryToMiddleware.values()];
  }

  // =========================================================================
  // Private methods
  // =========================================================================

  #validateCount(newCount: number): void {
    const totalSize = newCount + this.#factories.size;

    if (totalSize > MIDDLEWARE_LIMITS.HARD_LIMIT) {
      throw new Error(
        `[router.useMiddleware] Middleware limit exceeded (${MIDDLEWARE_LIMITS.HARD_LIMIT}). ` +
          `Current: ${this.#factories.size}, Attempting to add: ${newCount}. ` +
          `This indicates an architectural problem. Consider consolidating middleware.`,
      );
    }

    if (totalSize >= MIDDLEWARE_LIMITS.ERROR) {
      logger.error(
        "router.useMiddleware",
        `${totalSize} middleware registered! ` +
          `This is excessive and will impact performance. ` +
          `Hard limit at ${MIDDLEWARE_LIMITS.HARD_LIMIT}.`,
      );
    } else if (totalSize >= MIDDLEWARE_LIMITS.WARN) {
      logger.warn(
        "router.useMiddleware",
        `${totalSize} middleware registered. ` +
          `Consider if all are necessary.`,
      );
    }
  }
}
