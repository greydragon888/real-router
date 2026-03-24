/**
 * Validation plugin exports
 *
 * This subpath export provides types and utilities needed by the validation plugin
 * to validate router state and operations.
 */

export type { RouterValidator } from "./types/RouterValidator";
export { resolveForwardChain } from "./namespaces/RoutesNamespace/forwardChain";
export { INTERNAL_ROUTE_PREFIX } from "./namespaces/RoutesNamespace/constants";
export type { RoutesStore } from "./namespaces/RoutesNamespace/routesStore";
