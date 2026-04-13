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
  }
}

export type { LifecycleHook, LifecycleHookFactory } from "./types";
