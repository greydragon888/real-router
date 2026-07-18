// packages/core/src/types.ts

/**
 * Core-internal types + re-exports from @real-router/types.
 *
 * Factory types (PluginFactory, GuardFnFactory) and
 * route config types (Route, RouteConfigUpdate) are canonical in @real-router/types
 * and re-exported here for backward compatibility.
 */

import type {
  LimitsConfig,
  NavigationOptions,
  RouterError as RouterErrorType,
  State,
  TreeChangedEvent,
} from "./public-types";

// Re-export from @real-router/types (canonical source)
export type {
  GuardFnFactory,
  PluginFactory,
  Route,
  RouteConfigUpdate,
  EventMethodMap,
} from "./public-types";

/**
 * Event argument tuples for the router's 7 transition events plus the internal
 * `TREE_CHANGED` channel.
 *
 * Uses explicit `| undefined` unions (not optional `?`) to satisfy
 * `exactOptionalPropertyTypes` when passing undefined args from FSM payloads.
 *
 * `TREE_CHANGED` is an **internal-only** key: it is deliberately absent from the
 * public `EventName` union / `events.*` registry / `Plugin` interface. It
 * reuses the same `EventEmitter` (depth tracking, error isolation) but is only
 * reachable via `getRoutesApi(router).subscribeChanges()`.
 */
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- must be `type` for Record<string, unknown[]> constraint
export type RouterEventMap = {
  $start: [];
  $stop: [];
  $$start: [toState: State, fromState: State | undefined];
  $$leaveApprove: [toState: State, fromState: State | undefined];
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
  TREE_CHANGED: [event: TreeChangedEvent];
};

/**
 * Immutable limits configuration type.
 */
export type Limits = Readonly<LimitsConfig>;
