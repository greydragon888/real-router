// packages/core/src/namespaces/MiddlewareNamespace/MiddlewareNamespace.ts

import { logger } from "@real-router/logger";

import { MIDDLEWARE_LIMITS } from "./constants";
import {
  validateMiddleware,
  validateMiddlewareLimit,
  validateNoDuplicates,
  validateUseMiddlewareArgs,
} from "./validators";

import type { InitializedMiddleware, MiddlewareDependencies } from "./types";
import type { Router } from "../../Router";
import type { MiddlewareFactory } from "../../types";
import type {
  DefaultDependencies,
  Middleware,
  Unsubscribe,
} from "@real-router/types";

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
  // Proxy to functions in validators.ts for separation of concerns
  // =========================================================================

  static validateUseMiddlewareArgs<D extends DefaultDependencies>(
    middlewares: unknown[],
  ): asserts middlewares is MiddlewareFactory<D>[] {
    validateUseMiddlewareArgs<D>(middlewares);
  }

  static validateMiddleware<D extends DefaultDependencies>(
    middleware: unknown,
    factory: MiddlewareFactory<D>,
  ): asserts middleware is Middleware {
    validateMiddleware<D>(middleware, factory);
  }

  static validateNoDuplicates<D extends DefaultDependencies>(
    newFactories: MiddlewareFactory<D>[],
    existingFactories: MiddlewareFactory<D>[],
  ): void {
    validateNoDuplicates<D>(newFactories, existingFactories);
  }

  static validateMiddlewareLimit(currentCount: number, newCount: number): void {
    validateMiddlewareLimit(currentCount, newCount);
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
   * Returns the current number of registered middleware.
   */
  count(): number {
    return this.#factories.size;
  }

  /**
   * Initializes middleware factories without committing to storage.
   * Returns array of initialized middleware for validation by facade.
   *
   * @param factories - Already validated by facade
   */
  initialize(
    ...factories: MiddlewareFactory<Dependencies>[]
  ): InitializedMiddleware<Dependencies>[] {
    const initialized: InitializedMiddleware<Dependencies>[] = [];

    for (const factory of factories) {
      // Router and deps are guaranteed to be set at this point
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const router = this.#router!;
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const deps = this.#deps!;

      // Middleware factories receive full router as part of their public API
      const middleware = factory(router, deps.getDependency);

      initialized.push({ factory, middleware });
    }

    return initialized;
  }

  /**
   * Commits initialized middleware to storage.
   * Returns unsubscribe function to remove all added middleware.
   *
   * @param initialized - Already validated by facade
   */
  commit(initialized: InitializedMiddleware<Dependencies>[]): Unsubscribe {
    // Check count thresholds and log warnings if needed
    this.#checkCountThresholds(initialized.length);

    // Add to storage
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

  /**
   * Checks count thresholds and logs warnings/errors.
   * Does not throw - limit validation is done by facade.
   */
  #checkCountThresholds(newCount: number): void {
    const totalSize = newCount + this.#factories.size;

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
