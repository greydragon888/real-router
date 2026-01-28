// packages/core/src/namespaces/RouteLifecycleNamespace/constants.ts

/**
 * Lifecycle handler registry limits to prevent memory leaks.
 * Higher limits than middleware since routes can be numerous.
 */
export const LIFECYCLE_LIMITS = {
  WARN: 50, // Log warning - review route structure
  ERROR: 100, // Log error - too many routes with handlers
  HARD_LIMIT: 200, // Throw error - critical architectural issue
} as const;
