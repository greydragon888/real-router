import type { State } from "@real-router/core";

/**
 * Lifecycle hook callback for route transitions.
 * Fire-and-forget: return values are ignored, errors are caught and warned.
 */
export type LifecycleHook = (
  toState: State,
  fromState: State | undefined,
) => void;
