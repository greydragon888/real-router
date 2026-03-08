// packages/core/src/namespaces/PluginsNamespace/types.ts

import type { EventMethodMap, PluginFactory } from "../../types";
import type {
  DefaultDependencies,
  EventName,
  Plugin,
  Unsubscribe,
} from "@real-router/types";

export interface PluginsDependencies<
  Dependencies extends DefaultDependencies = DefaultDependencies,
> {
  addEventListener: <E extends EventName>(
    eventName: E,
    cb: Plugin[EventMethodMap[E]],
  ) => Unsubscribe;

  canNavigate: () => boolean;

  compileFactory: (factory: PluginFactory<Dependencies>) => Plugin;
}
