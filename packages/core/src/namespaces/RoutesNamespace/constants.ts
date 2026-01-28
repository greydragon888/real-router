// packages/core/src/namespaces/RoutesNamespace/constants.ts

/**
 * Default route name for the root node.
 */
export const DEFAULT_ROUTE_NAME = "";

/**
 * Cache for validated route names to skip regex validation on repeated calls.
 * Key insight: validateRouteName() regex takes ~40ns, but cache lookup is ~1ns.
 * This cache is module-level (shared across all router instances) since route name
 * validity is independent of router instance.
 */
export const validatedRouteNames = new Set<string>();
