// packages/core/src/namespaces/PluginsNamespace/types.ts

import type {
  DefaultDependencies,
  EventName,
  Plugin,
  RouterLogger,
  Unsubscribe,
  EventMethodMap,
  PluginFactory,
  CheckPositionMap,
  DiagnosticEventMap,
} from "../../types";

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

  /** Whether the router is disposed — asked before each factory and after its start. */
  isDisposed: () => boolean;

  /** Runs the checks registered at a position (#2388); a check may only throw. */
  runChecks: <P extends keyof CheckPositionMap>(
    position: P,
    ...args: CheckPositionMap[P]
  ) => void;

  /**
   * Reports an internal DIAGNOSTIC (#2388). Core states what happened; whether
   * anyone is told is the listening plugin's business, and with no listener
   * this costs one `Map.get`.
   */
  emitDiagnostic: <K extends keyof DiagnosticEventMap>(
    key: K,
    ...args: DiagnosticEventMap[K]
  ) => void;
}
