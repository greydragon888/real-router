// packages/core/src/types.ts

/**
 * Router-dependent types.
 *
 * These types reference the Router class and are therefore defined in core
 * rather than core-types to avoid circular dependencies.
 */

import type { events, plugins } from "./constants";
import type { Router } from "./Router";
import type {
  ActivationFn,
  DefaultDependencies,
  EventsKeys,
  ForwardToCallback,
  LimitsConfig,
  Middleware,
  NavigationOptions,
  Params,
  Plugin,
  RouterError as RouterErrorType,
  RouteTreeState,
  State,
} from "@real-router/types";

export type EventMethodMap = {
  [K in EventsKeys as (typeof events)[K]]: (typeof plugins)[K];
};

/**
 * Event argument tuples for the router's 6 events.
 *
 * Uses explicit `| undefined` unions (not optional `?`) to satisfy
 * `exactOptionalPropertyTypes` when passing undefined args from FSM payloads.
 */
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- must be `type` for Record<string, unknown[]> constraint
export type RouterEventMap = {
  $start: [];
  $stop: [];
  $$start: [toState: State, fromState: State | undefined];
  $$success: [
    toState: State,
    fromState: State | undefined,
    opts: NavigationOptions | undefined,
  ];
  $$error: [
    toState: State | undefined,
    fromState: State | undefined,
    error: RouterErrorType | undefined,
  ];
  $$cancel: [toState: State, fromState: State | undefined];
};

/**
 * Immutable limits configuration type.
 */
export type Limits = Readonly<LimitsConfig>;

/**
 * Extended build result that includes segments for path building.
 * Used internally to avoid duplicate getSegmentsByName calls.
 *
 * @param segments - Route segments from getSegmentsByName (typed as unknown[] for cross-package compatibility)
 * @internal
 */
export interface BuildStateResultWithSegments<P extends Params = Params> {
  readonly state: RouteTreeState<P>;
  readonly segments: readonly unknown[];
}

/**
 * Route configuration.
 */
export interface Route<
  Dependencies extends DefaultDependencies = DefaultDependencies,
> {
  [key: string]: unknown;
  /** Route name (dot-separated for nested routes). */
  name: string;
  /** URL path pattern for this route. */
  path: string;
  /** Factory function that returns a guard for route activation. */
  canActivate?: ActivationFnFactory<Dependencies>;
  /** Factory function that returns a guard for route deactivation. */
  canDeactivate?: ActivationFnFactory<Dependencies>;
  /**
   * Redirects navigation to another route.
   *
   * IMPORTANT: forwardTo creates a URL alias, not a transition chain.
   * Guards (canActivate) on the source route are NOT executed.
   * Only guards on the final destination are executed.
   *
   * This matches Vue Router and Angular Router behavior.
   *
   * @example
   * // Correct: guard on target
   * { name: "old", path: "/old", forwardTo: "new" }
   * { name: "new", path: "/new", canActivate: myGuard }
   *
   * // Wrong: guard on source (will be ignored with warning)
   * { name: "old", path: "/old", forwardTo: "new", canActivate: myGuard }
   */
  forwardTo?: string | ForwardToCallback<Dependencies>;
  /** Nested child routes. */
  children?: Route<Dependencies>[];
  /** Encodes state params to URL params. */
  encodeParams?: (stateParams: Params) => Params;
  /** Decodes URL params to state params. */
  decodeParams?: (pathParams: Params) => Params;
  /**
   * Default parameters for this route.
   *
   * @remarks
   * **Type Contract:**
   * The type of defaultParams MUST match the expected params type P
   * when using `router.makeState<P>()` or `router.navigate<P>()`.
   *
   * These values are merged into state.params when creating route states.
   * Missing URL params are filled from defaultParams.
   *
   * @example
   * ```typescript
   * // Define route with pagination defaults
   * {
   *   name: "users",
   *   path: "/users",
   *   defaultParams: { page: 1, limit: 10 }
   * }
   *
   * // Navigate without specifying page/limit
   * router.navigate("users", { filter: "active" });
   * // Result: state.params = { page: 1, limit: 10, filter: "active" }
   *
   * // Correct typing — include defaultParams properties
   * type UsersParams = { page: number; limit: number; filter?: string };
   * ```
   */
  defaultParams?: Params;
}

/**
 * Configuration update options for updateRoute().
 * All properties are optional. Set to null to remove the configuration.
 */
export interface RouteConfigUpdate<
  Dependencies extends DefaultDependencies = DefaultDependencies,
> {
  /** Set to null to remove forwardTo */
  forwardTo?: string | ForwardToCallback<Dependencies> | null;
  /** Set to null to remove defaultParams */
  defaultParams?: Params | null;
  /** Set to null to remove decoder */
  decodeParams?: ((params: Params) => Params) | null;
  /** Set to null to remove encoder */
  encodeParams?: ((params: Params) => Params) | null;
  /** Set to null to remove canActivate */
  canActivate?: ActivationFnFactory<Dependencies> | null;
  /** Set to null to remove canDeactivate */
  canDeactivate?: ActivationFnFactory<Dependencies> | null;
}

/**
 * Factory function for creating activation guards.
 * Receives the router instance and a dependency getter.
 */
export type ActivationFnFactory<
  Dependencies extends DefaultDependencies = DefaultDependencies,
> = (
  router: Router<Dependencies>,
  getDependency: <K extends keyof Dependencies>(key: K) => Dependencies[K],
) => ActivationFn;

/**
 * Factory function for creating middleware.
 * Receives the router instance and a dependency getter.
 */
export type MiddlewareFactory<
  Dependencies extends DefaultDependencies = DefaultDependencies,
> = (
  router: Router<Dependencies>,
  getDependency: <K extends keyof Dependencies>(key: K) => Dependencies[K],
) => Middleware;

/**
 * Factory function for creating plugins.
 * Receives the router instance and a dependency getter.
 */
export type PluginFactory<
  Dependencies extends DefaultDependencies = DefaultDependencies,
> = (
  router: Router<Dependencies>,
  getDependency: <K extends keyof Dependencies>(key: K) => Dependencies[K],
) => Plugin;
