// packages/core/src/namespaces/RouteLifecycleNamespace/types.ts

import type {
  DefaultDependencies,
  GuardFn,
  RouterLogger,
  GuardFnFactory,
} from "../../types";
import type { RouterValidator } from "../../types/RouterValidator";

export interface RouteLifecycleDependencies<
  Dependencies extends DefaultDependencies = DefaultDependencies,
> {
  /** Per-router logger instance (from `getInternals(router).logger`) */
  logger: RouterLogger;

  compileFactory: (factory: GuardFnFactory<Dependencies>) => GuardFn;
  /**
   * Returns the opt-in DX validator, or `null` when no validation-plugin is
   * installed. A plain deps field (#1331) — internals are registered before
   * wiring, so `getInternals(router)` never throws and no try/catch is needed.
   */
  getValidator: () => RouterValidator | null;
}
