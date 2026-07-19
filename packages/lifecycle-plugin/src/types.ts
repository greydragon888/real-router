import type { State, DefaultDependencies } from "@real-router/core";
import type { Router } from "@real-router/core/types";

/**
 * Lifecycle hook callback for route transitions.
 * Fire-and-forget: return values are ignored. A throwing hook is caught and
 * re-thrown asynchronously via `queueMicrotask` (#798), so it surfaces as an
 * uncaught error to global handlers — it never aborts the transition and is NOT
 * routed through the router's EventEmitter.
 */
export type LifecycleHook = (
  toState: State,
  fromState: State | undefined,
) => void;

/**
 * Factory function for creating lifecycle hooks.
 * Receives the router instance and a dependency getter (same pattern as GuardFnFactory).
 * Factory runs once at first invocation; the returned hook is cached per route.
 *
 * A throwing factory (e.g. a failing DI init) is isolated exactly like a throwing
 * hook body — caught and re-thrown asynchronously via `queueMicrotask` (#1222), so
 * it never swallows a sibling `onNavigate` and never aborts the transition. A
 * failed compile is NOT cached, so the factory is retried on every navigation.
 */
export type LifecycleHookFactory<
  Dependencies extends DefaultDependencies = DefaultDependencies,
> = (
  router: Router<Dependencies>,
  getDependency: <K extends keyof Dependencies>(key: K) => Dependencies[K],
) => LifecycleHook;
