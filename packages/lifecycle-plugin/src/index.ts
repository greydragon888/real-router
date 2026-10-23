import type { LifecycleHookFactory } from "./types";
import type { DefaultDependencies } from "@real-router/core";

export { lifecyclePluginFactory } from "./factory";

/**
 * Module augmentation for real-router.
 * Extends Route interface with lifecycle hook factories.
 */
declare module "@real-router/core" {
  interface Route<Dependencies extends DefaultDependencies> {
    // The hooks run for the routes of the navigation target and the previous
    // state only — a parent of either gets none (#2693).
    /**
     * Factory that returns a hook called when a committed navigation lands on
     * this route from another route, or the router starts on it.
     */
    onEnter?: LifecycleHookFactory<Dependencies>;
    /**
     * Factory that returns a hook called when a committed navigation lands on
     * this route from itself, whether or not params or search changed.
     */
    onStay?: LifecycleHookFactory<Dependencies>;
    /**
     * Factory that returns a hook called when a committed navigation leaves
     * this route for another one.
     */
    onLeave?: LifecycleHookFactory<Dependencies>;
    /**
     * Factory that returns a hook called on every successful navigation to this
     * route (both entry and stay). Fires independently of `onEnter` /
     * `onStay` (orthogonal dispatch) — declaring one never silences another.
     */
    onNavigate?: LifecycleHookFactory<Dependencies>;
  }

  // Makes the hooks patchable via `getRoutesApi(router).update(name, patch)`
  // (symmetric with the Route augmentation above). `null` removes a hook; the
  // plugin recompiles lazily on the next navigation when the factory changes.
  interface RouteConfigUpdate<Dependencies extends DefaultDependencies> {
    onEnter?: LifecycleHookFactory<Dependencies> | null;
    onStay?: LifecycleHookFactory<Dependencies> | null;
    onLeave?: LifecycleHookFactory<Dependencies> | null;
    onNavigate?: LifecycleHookFactory<Dependencies> | null;
  }
}

export type { LifecycleHook, LifecycleHookFactory } from "./types";
