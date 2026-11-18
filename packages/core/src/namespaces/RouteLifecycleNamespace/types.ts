// packages/core/src/namespaces/RouteLifecycleNamespace/types.ts

import type {
  CheckPositionMap,
  DefaultDependencies,
  DiagnosticEventMap,
  GuardFn,
  RouterLogger,
  GuardFnFactory,
} from "../../types";

export interface RouteLifecycleDependencies<
  Dependencies extends DefaultDependencies = DefaultDependencies,
> {
  /** Per-router logger instance (from `getInternals(router).logger`) */
  logger: RouterLogger;

  compileFactory: (factory: GuardFnFactory<Dependencies>) => GuardFn;

  /** Runs the checks registered at a position (#2388); a check may only throw. */
  runChecks: <P extends keyof CheckPositionMap>(
    position: P,
    ...args: CheckPositionMap[P]
  ) => void;

  /** Whether any check stands at a position — asked before computing its arguments. */
  hasChecks: (position: keyof CheckPositionMap) => boolean;

  /** Reports an internal DIAGNOSTIC (#2388). Core states what happened. */
  emitDiagnostic: <K extends keyof DiagnosticEventMap>(
    key: K,
    ...args: DiagnosticEventMap[K]
  ) => void;

  /** How many handlers listen to a kind — asked before computing its arguments. */
  diagnosticListenerCount: (key: keyof DiagnosticEventMap) => number;
}
