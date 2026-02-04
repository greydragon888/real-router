// packages/core/src/namespaces/RouteLifecycleNamespace/validators.ts

/**
 * Static validation functions for RouteLifecycleNamespace.
 * Called by Router facade before instance methods.
 */

import { isBoolean, getTypeDescription } from "type-guards";

import { DEFAULT_LIMITS } from "../LimitsNamespace/constants";

import type { ActivationFnFactory } from "../../types";
import type { DefaultDependencies } from "@real-router/types";

/**
 * Validates that a handler is either a boolean or a factory function.
 */
export function validateHandler<D extends DefaultDependencies>(
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

/**
 * Validates that a route is not currently being registered.
 * Prevents self-modification during factory compilation.
 */
export function validateNotRegistering(
  isRegistering: boolean,
  name: string,
  methodName: string,
): void {
  if (isRegistering) {
    throw new Error(
      `[router.${methodName}] Cannot modify route "${name}" during its own registration`,
    );
  }
}

/**
 * Validates that adding a new handler won't exceed the hard limit.
 */
export function validateHandlerLimit(
  currentCount: number,
  methodName: string,
  maxLifecycleHandlers: number = DEFAULT_LIMITS.maxLifecycleHandlers,
): void {
  if (currentCount >= maxLifecycleHandlers) {
    throw new Error(
      `[router.${methodName}] Lifecycle handler limit exceeded (${maxLifecycleHandlers}). ` +
        `This indicates too many routes with individual handlers. ` +
        `Consider using middleware for cross-cutting concerns.`,
    );
  }
}
