// packages/core/src/namespaces/MiddlewareNamespace/MiddlewareNamespace.ts

import { logger } from "@real-router/logger";

import {
  validateMiddleware,
  validateMiddlewareLimit,
  validateNoDuplicates,
  validateUseMiddlewareArgs,
} from "./validators";
import { DEFAULT_LIMITS } from "../LimitsNamespace/constants";
import { computeThresholds } from "../LimitsNamespace/helpers";

import type { InitializedMiddleware, MiddlewareDependencies } from "./types";
import type { Router } from "../../Router";
import type { MiddlewareFactory } from "../../types";
import type { LimitsNamespace } from "../LimitsNamespace";
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

  #router: Router<Dependencies> | undefined;

  #deps: MiddlewareDependencies<Dependencies> | undefined;

  #limits?: LimitsNamespace;

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

  static validateMiddlewareLimit(
    currentCount: number,
    newCount: number,
    maxMiddleware?: number,
  ): void {
    validateMiddlewareLimit(currentCount, newCount, maxMiddleware);
  }

  // =========================================================================
  // Dependency injection
  // =========================================================================

  setRouter(router: Router<Dependencies>): void {
    this.#router = router;
  }

  setDependencies(deps: MiddlewareDependencies<Dependencies>): void {
    this.#deps = deps;
  }

  setLimits(limits: LimitsNamespace): void {
    this.#limits = limits;
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
    let unsubscribed = false;

    return (): void => {
      if (unsubscribed) {
        return;
      }

      unsubscribed = true;

      for (const { factory } of initialized) {
        this.#factories.delete(factory);
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

  #checkCountThresholds(newCount: number): void {
    const totalSize = newCount + this.#factories.size;

    const maxMiddleware =
      this.#limits?.get().maxMiddleware ?? DEFAULT_LIMITS.maxMiddleware;
    const { warn, error } = computeThresholds(maxMiddleware);

    if (totalSize >= error) {
      logger.error(
        "router.useMiddleware",
        `${totalSize} middleware registered! ` +
          `This is excessive and will impact performance. ` +
          `Hard limit at ${maxMiddleware}.`,
      );
    } else if (totalSize >= warn) {
      logger.warn(
        "router.useMiddleware",
        `${totalSize} middleware registered. ` +
          `Consider if all are necessary.`,
      );
    }
  }
}
