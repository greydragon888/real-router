// packages/core/src/namespaces/CloneNamespace/types.ts

import type { Router } from "../../Router";
import type {
  GuardFnFactory,
  MiddlewareFactory,
  PluginFactory,
  Route,
} from "../../types";
import type { RouteConfig } from "../RoutesNamespace";
import type { DefaultDependencies, Options } from "@real-router/types";

/**
 * Data collected from source router for cloning.
 */
export interface CloneData<Dependencies extends DefaultDependencies> {
  routes: Route<Dependencies>[];
  options: Options;
  dependencies: Partial<Dependencies>;
  canDeactivateFactories: Record<string, GuardFnFactory<Dependencies>>;
  canActivateFactories: Record<string, GuardFnFactory<Dependencies>>;
  middlewareFactories: MiddlewareFactory<Dependencies>[];
  pluginFactories: PluginFactory<Dependencies>[];
  routeConfig: RouteConfig;
  resolvedForwardMap: Record<string, string>;
}

/**
 * Factory function to create a new router instance.
 */
export type RouterFactory<Dependencies extends DefaultDependencies> = (
  routes: Route<Dependencies>[],
  options: Partial<Options>,
  dependencies: Dependencies,
) => Router<Dependencies>;

/**
 * Function to apply route config to a new router.
 */
export type ApplyConfigFn<
  Dependencies extends DefaultDependencies = DefaultDependencies,
> = (
  router: Router<Dependencies>,
  config: RouteConfig,
  resolvedForwardMap: Record<string, string>,
) => void;
