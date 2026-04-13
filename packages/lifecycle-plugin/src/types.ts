import type { State } from "@real-router/core";
import type { DefaultDependencies, Router } from "@real-router/types";

/**
 * Lifecycle hook callback for route transitions.
 * Fire-and-forget: return values are ignored, errors propagate to EventEmitter (logged to stderr).
 */
export type LifecycleHook = (
  toState: State,
  fromState: State | undefined,
) => void;

/**
 * Factory function for creating lifecycle hooks.
 * Receives the router instance and a dependency getter (same pattern as GuardFnFactory).
 * Factory runs once at first invocation; the returned hook is cached per route.
 */
export type LifecycleHookFactory<
  Dependencies extends DefaultDependencies = DefaultDependencies,
> = (
  router: Router<Dependencies>,
  getDependency: <K extends keyof Dependencies>(key: K) => Dependencies[K],
) => LifecycleHook;
