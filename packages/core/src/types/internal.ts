// packages/core/src/types/internal.ts

/**
 * Core-internal types. NOT part of the public `@real-router/core/types` surface
 * (the `./index` barrel deliberately does not re-export these), so they never
 * leak onto the subpath or the package root. Core modules import them directly
 * from `./types/internal`.
 *
 * Imports pull from the sibling declaration files (not `./index`) to keep
 * `internal.ts` off the barrel's re-export cycle (`import-x/no-cycle`).
 */

import type {
  NavigationOptions,
  RouterError as RouterErrorType,
  State,
} from "./base";
import type { LimitsConfig } from "./limits";
import type { TreeChangedEvent } from "./tree-changed";

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
