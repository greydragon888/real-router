// packages/core/src/namespaces/MiddlewareNamespace/types.ts

import type { MiddlewareFactory } from "@real-router/core";
import type { DefaultDependencies, Middleware } from "@real-router/types";

/**
 * Dependencies injected into MiddlewareNamespace.
 *
 * Note: Middleware factories still receive the router object directly
 * as they need access to various router methods. This interface
 * only covers the internal namespace operations.
 */
export interface MiddlewareDependencies<
  Dependencies extends DefaultDependencies = DefaultDependencies,
> {
  /** Get dependency value for middleware factory */
  getDependency: <K extends keyof Dependencies>(key: K) => Dependencies[K];
}

/**
 * Initialized middleware entry returned by initialize().
 */
export interface InitializedMiddleware<
  Dependencies extends DefaultDependencies,
> {
  factory: MiddlewareFactory<Dependencies>;
  middleware: Middleware;
}
