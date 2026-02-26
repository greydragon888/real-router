// packages/core/src/types.ts

/**
 * Core-internal types + re-exports from @real-router/types.
 *
 * Factory types (PluginFactory, GuardFnFactory, ActivationFnFactory) and
 * route config types (Route, RouteConfigUpdate) are canonical in @real-router/types
 * and re-exported here for backward compatibility.
 */

import type {
  LimitsConfig,
  NavigationOptions,
  Params,
  RouterError as RouterErrorType,
  RouteTreeState,
  State,
} from "@real-router/types";

// Re-export from @real-router/types (canonical source)
export type {
  ActivationFnFactory,
  GuardFnFactory,
  PluginFactory,
  Route,
  RouteConfigUpdate,
  EventMethodMap,
} from "@real-router/types";

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
