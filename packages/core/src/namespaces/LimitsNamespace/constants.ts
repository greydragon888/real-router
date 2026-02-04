// packages/core/src/namespaces/LimitsNamespace/constants.ts

/**
 * Default limits configuration for the router.
 * These values match the hardcoded constants from the current codebase.
 */
export const DEFAULT_LIMITS = {
  maxDependencies: 100,
  maxPlugins: 50,
  maxMiddleware: 50,
  maxListeners: 10_000,
  maxEventDepth: 5,
  maxLifecycleHandlers: 200,
} as const;

/**
 * Bounds for each limit - defines min and max allowed values.
 * Used for runtime validation in setLimit/withLimits.
 */
export const LIMIT_BOUNDS = {
  maxDependencies: { min: 1, max: 10_000 },
  maxPlugins: { min: 1, max: 1000 },
  maxMiddleware: { min: 1, max: 1000 },
  maxListeners: { min: 1, max: 100_000 },
  maxEventDepth: { min: 1, max: 100 },
  maxLifecycleHandlers: { min: 1, max: 10_000 },
} as const;
