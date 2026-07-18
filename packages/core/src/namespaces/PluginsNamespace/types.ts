// packages/core/src/namespaces/PluginsNamespace/types.ts

import type {
  DefaultDependencies,
  EventName,
  Plugin,
  RouterLogger,
  Unsubscribe,
} from "../../public-types";
import type { EventMethodMap, PluginFactory } from "../../types";
import type { RouterValidator } from "../../types/RouterValidator";

export interface PluginsDependencies<
  Dependencies extends DefaultDependencies = DefaultDependencies,
> {
  /** Per-router logger instance (from `getInternals(router).logger`) */
  logger: RouterLogger;

  addEventListener: <E extends EventName>(
    eventName: E,
    cb: Plugin[EventMethodMap[E]],
  ) => Unsubscribe;

  canNavigate: () => boolean;

  compileFactory: (factory: PluginFactory<Dependencies>) => Plugin;

  /**
   * Returns the opt-in DX validator, or `null` when no validation-plugin is
   * installed. A plain deps field (#1331) — internals are registered before
   * wiring, so `getInternals(router)` never throws and no try/catch is needed.
   */
  getValidator: () => RouterValidator | null;
}
