// packages/core/src/wiring/wireRouter.ts

import type { RouterWiringBuilder } from "./RouterWiringBuilder";
import type { DefaultDependencies } from "@real-router/types";

/**
 * Director function — calls RouterWiringBuilder methods in the correct dependency order.
 *
 * ORDER MATTERS:
 * - `wireLimits()` first: all namespaces must have limits before any other setup
 * - `wireRouteLifecycleDeps()` BEFORE `wireRoutesDeps()`: RoutesNamespace.setDependencies()
 *   registers pending canActivate handlers which require RouteLifecycleNamespace to be ready
 * - `wireCyclicDeps()` LAST: resolves circular references between NavigationNamespace and
 *   RouterLifecycleNamespace (they depend on each other via direct property assignment)
 */
export function wireRouter<Dependencies extends DefaultDependencies>(
  builder: RouterWiringBuilder<Dependencies>,
): void {
  builder.wireLimits();
  builder.wireRouteLifecycleDeps();
  builder.wireRoutesDeps();
  builder.wireMiddlewareDeps();
  builder.wirePluginsDeps();
  builder.wireNavigationDeps();
  builder.wireLifecycleDeps();
  builder.wireStateDeps();
  builder.wireCyclicDeps();
}
