// packages/core/src/namespaces/RouteLifecycleNamespace/types.ts

import type { GuardFnFactory } from "../../types";
import type { DefaultDependencies, GuardFn } from "@real-router/types";

export interface RouteLifecycleDependencies<
  Dependencies extends DefaultDependencies = DefaultDependencies,
> {
  compileFactory: (factory: GuardFnFactory<Dependencies>) => GuardFn;
}
