// packages/core/src/namespaces/MiddlewareNamespace/validators.ts

/**
 * Static validation functions for MiddlewareNamespace.
 * Called by Router facade before instance methods.
 */

import { getTypeDescription } from "type-guards";

import { MIDDLEWARE_LIMITS } from "./constants";

import type { MiddlewareFactory } from "../../types";
import type { DefaultDependencies, Middleware } from "@real-router/types";

/**
 * Gets a displayable name for a factory function.
 */
// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
function getFactoryName(factory: Function): string {
  return factory.name || "anonymous";
}

/**
 * Validates useMiddleware arguments - each must be a function.
 */
export function validateUseMiddlewareArgs<D extends DefaultDependencies>(
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
export function validateMiddleware<D extends DefaultDependencies>(
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

/**
 * Validates that no duplicate factories are being registered.
 */
export function validateNoDuplicates<D extends DefaultDependencies>(
  newFactories: MiddlewareFactory<D>[],
  existingFactories: MiddlewareFactory<D>[],
): void {
  const existingSet = new Set(existingFactories);

  for (const factory of newFactories) {
    if (existingSet.has(factory)) {
      throw new Error(
        `[router.useMiddleware] Middleware factory already registered. ` +
          `To re-register, first unsubscribe the existing middleware. ` +
          `Factory: ${getFactoryName(factory)}`,
      );
    }
  }
}

/**
 * Validates that adding middleware won't exceed the hard limit.
 */
export function validateMiddlewareLimit(
  currentCount: number,
  newCount: number,
): void {
  const totalSize = currentCount + newCount;

  if (totalSize > MIDDLEWARE_LIMITS.HARD_LIMIT) {
    throw new Error(
      `[router.useMiddleware] Middleware limit exceeded (${MIDDLEWARE_LIMITS.HARD_LIMIT}). ` +
        `Current: ${currentCount}, Attempting to add: ${newCount}. ` +
        `This indicates an architectural problem. Consider consolidating middleware.`,
    );
  }
}
