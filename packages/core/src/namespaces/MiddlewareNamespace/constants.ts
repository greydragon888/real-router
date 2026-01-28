// packages/core/src/namespaces/MiddlewareNamespace/constants.ts

/**
 * Middleware registry limits to prevent memory leaks and architectural issues.
 * Based on practical experience with production routers.
 */
export const MIDDLEWARE_LIMITS = {
  WARN: 15, // Log warning - consider refactoring
  ERROR: 30, // Log error - architectural problem
  HARD_LIMIT: 50, // Throw error - critical issue
} as const;
