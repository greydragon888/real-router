// packages/validation-plugin/src/validators/options.ts

// Local type - mirrors LimitsConfig from @real-router/types
// (@real-router/types is not a direct dependency of this package)
interface LimitsConfig {
  maxDependencies: number;
  maxPlugins: number;
  maxListeners: number;
  warnListeners: number;
  maxEventDepth: number;
  maxLifecycleHandlers: number;
}

// Local constant - mirrors LIMIT_BOUNDS from @real-router/core/constants
// (not exported from @real-router/core public API)
const LIMIT_BOUNDS = {
  maxDependencies: { min: 0, max: 10_000 },
  maxPlugins: { min: 0, max: 1000 },
  maxListeners: { min: 0, max: 100_000 },
  warnListeners: { min: 0, max: 100_000 },
  maxEventDepth: { min: 0, max: 100 },
  maxLifecycleHandlers: { min: 0, max: 10_000 },
} as const;

export function validateLimitValue(
  limitName: keyof LimitsConfig,
  value: unknown,
  methodName: string,
): void {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new TypeError(
      `[router.${methodName}]: limit "${limitName}" must be an integer, got ${String(value)}`,
    );
  }

  const bounds = LIMIT_BOUNDS[limitName];

  if (value < bounds.min || value > bounds.max) {
    throw new RangeError(
      `[router.${methodName}]: limit "${limitName}" must be between ${bounds.min} and ${bounds.max}, got ${value}`,
    );
  }
}

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
