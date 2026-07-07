// packages/core/src/wiring/wireRouter.ts

import type { RouterWiringBuilder } from "./RouterWiringBuilder";
import type { DefaultDependencies } from "@real-router/types";

/**
 * Director function — invokes the wire-* methods that inject inter-namespace
 * dependencies.
 *
 * Call order is arbitrary (#1331). Each wire-* method only stores deps-closures
 * on its namespace; none runs user code or eagerly reads another namespace's
 * deps, so there is no ordering constraint between them. (The former
 * "RouteLifecycle before Routes" requirement was an artifact of flushing pending
 * guards inside `RoutesNamespace.setDependencies`; that flush now runs after all
 * wiring completes, from the constructor's `flushPendingGuards()` call.)
 */
export function wireRouter<Dependencies extends DefaultDependencies>(
  builder: RouterWiringBuilder<Dependencies>,
): void {
  builder.wireLimits();
  builder.wireRouteLifecycleDeps();
  builder.wireRoutesDeps();
  builder.wirePluginsDeps();
  builder.wireNavigationDeps();
  builder.wireLifecycleDeps();
  builder.wireStateDeps();
}
