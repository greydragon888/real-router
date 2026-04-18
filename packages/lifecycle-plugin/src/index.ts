import type { LifecycleHookFactory } from "./types";
import type { DefaultDependencies } from "@real-router/core";

export { lifecyclePluginFactory } from "./factory";

/**
 * Module augmentation for real-router.
 * Extends Route interface with lifecycle hook factories.
 */
declare module "@real-router/core" {
  interface Route<Dependencies extends DefaultDependencies> {
    /** Factory that returns a hook called when this route segment is newly activated (entered). */
    onEnter?: LifecycleHookFactory<Dependencies>;
    /** Factory that returns a hook called when this route segment stays active but params changed. */
    onStay?: LifecycleHookFactory<Dependencies>;
    /** Factory that returns a hook called when this route segment is deactivated (left). */
    onLeave?: LifecycleHookFactory<Dependencies>;
    /**
     * Factory that returns a hook called on every successful navigation to this route
     * (both entry and param-change). Acts as a fallback when `onEnter` or `onStay`
     * is not defined for the corresponding case.
     */
    onNavigate?: LifecycleHookFactory<Dependencies>;
  }
}

export type { LifecycleHook, LifecycleHookFactory } from "./types";
