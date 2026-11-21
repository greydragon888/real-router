import type { State, DefaultDependencies } from "@real-router/core";
import type { Router } from "@real-router/core/types";

/**
 * Lifecycle hook callback for route transitions.
 * A hook returns its load — a thenable — or nothing. A throwing hook and the
 * rejection of the thenable it returned go to the router's logger as
 * `logger.error` (#2975): neither aborts the transition, and neither silences
 * a later hook of the same transition (#798). A rejection with the reason of
 * the hook's `signal`, or with that reason as its `cause`, is the hook's own
 * abort and is not logged.
 *
 * `signal` aborts when the work the hook started is no longer wanted (#2692):
 * `onEnter`'s when its route is left, and `onStay`'s, `onNavigate`'s and
 * `onLeave`'s when the next navigation commits. `stop()`, `dispose()` and
 * removing the plugin abort them all; a navigation that does not commit aborts
 * none. The reason is a fresh `AbortError` `DOMException`.
 */
export type LifecycleHook = (
  toState: State,
  fromState: State | undefined,
  signal: AbortSignal,
  // eslint-disable-next-line @typescript-eslint/no-invalid-void-type -- `void` admits a hook with no `return`; the thenable is the load a hook returns
) => void | PromiseLike<unknown>;

/**
 * Factory function for creating lifecycle hooks.
 * Receives the router instance and a dependency getter (same pattern as GuardFnFactory).
 * Factory runs once at first invocation; the returned hook is cached per route.
 *
 * A throwing factory (e.g. a failing DI init) is isolated exactly like a throwing
 * hook body (#1222) — its error goes to the router's logger, it never swallows
 * a sibling `onNavigate` and never aborts the transition. A failed compile is
 * NOT cached, so the factory is retried on every navigation.
 */
export type LifecycleHookFactory<
  Dependencies extends DefaultDependencies = DefaultDependencies,
> = (
  router: Router<Dependencies>,
  getDependency: <K extends keyof Dependencies>(key: K) => Dependencies[K],
) => LifecycleHook;
