import type { LifecycleHook } from "./types";

export { lifecyclePluginFactory } from "./factory";

/**
 * Module augmentation for real-router.
 * Extends Route interface with lifecycle hooks.
 */
declare module "@real-router/core" {
  interface Route {
    /** Called when this route segment is newly activated (entered). */
    onEnter?: LifecycleHook;
    /** Called when this route segment stays active but params changed. */
    onStay?: LifecycleHook;
    /** Called when this route segment is deactivated (left). */
    onLeave?: LifecycleHook;
  }
}

export type { LifecycleHook } from "./types";
