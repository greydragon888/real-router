// packages/core/src/namespaces/LimitsNamespace/validators.ts

import { LIMIT_BOUNDS } from "./constants";

export interface LimitsConfig {
  maxDependencies: number;
  maxPlugins: number;
  maxMiddleware: number;
  maxListeners: number;
  maxEventDepth: number;
  maxLifecycleHandlers: number;
}

/**
 * Validates that a limit value is within bounds.
 */
export function validateLimitValue(
  limitName: keyof LimitsConfig,
  value: unknown,
  methodName: string,
): void {
  if (typeof value !== "number") {
    throw new TypeError(
      `[router.${methodName}]: limit "${limitName}" must be a number, got ${typeof value}`,
    );
  }

  if (!Number.isInteger(value)) {
    throw new TypeError(
      `[router.${methodName}]: limit "${limitName}" must be an integer, got ${value}`,
    );
  }

  const bounds = LIMIT_BOUNDS[limitName];

  if (value < bounds.min || value > bounds.max) {
    throw new RangeError(
      `[router.${methodName}]: limit "${limitName}" must be between ${bounds.min} and ${bounds.max}, got ${value}`,
    );
  }
}

/**
 * Validates that limit name is a string.
 */
export function validateLimitName(
  name: unknown,
  methodName: string,
): asserts name is string {
  if (typeof name !== "string") {
    throw new TypeError(
      `[router.${methodName}]: limit name must be a string, got ${typeof name}`,
    );
  }
}

/**
 * Validates that limit exists in bounds.
 */
export function validateLimitExists(
  limitName: string,
  methodName: string,
): void {
  if (!Object.hasOwn(LIMIT_BOUNDS, limitName)) {
    throw new ReferenceError(
      `[router.${methodName}]: limit "${limitName}" not found`,
    );
  }
}

/**
 * Validates a partial limits object.
 */
export function validateLimits(
  limits: unknown,
  methodName: string,
): asserts limits is Partial<LimitsConfig> {
  if (!limits || typeof limits !== "object" || limits.constructor !== Object) {
    throw new TypeError(
      `[router.${methodName}]: invalid limits: expected plain object, got ${typeof limits}`,
    );
  }

  for (const [key, value] of Object.entries(limits)) {
    if (!Object.hasOwn(LIMIT_BOUNDS, key)) {
      throw new TypeError(`[router.${methodName}]: unknown limit: "${key}"`);
    }

    if (value === undefined) {
      continue;
    }

    validateLimitValue(key as keyof LimitsConfig, value, methodName);
  }
}
