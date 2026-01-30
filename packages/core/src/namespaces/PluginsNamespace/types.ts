// packages/core/src/namespaces/PluginsNamespace/types.ts

import type { EventMethodMap } from "../index";
import type {
  DefaultDependencies,
  EventName,
  Plugin,
  Unsubscribe,
} from "@real-router/types";

/**
 * Dependencies injected into PluginsNamespace.
 *
 * Note: Plugin factories still receive the router object directly
 * as they need access to various router methods. This interface
 * only covers the internal namespace operations.
 */
export interface PluginsDependencies<
  Dependencies extends DefaultDependencies = DefaultDependencies,
> {
  /** Add event listener for plugin subscription */
  addEventListener: <E extends EventName>(
    eventName: E,
    cb: Plugin[EventMethodMap[E]],
  ) => Unsubscribe;

  /** Check if router is started (for warning about late onStart) */
  isStarted: () => boolean;

  /** Get dependency value for plugin factory */
  getDependency: <K extends keyof Dependencies>(key: K) => Dependencies[K];
}
