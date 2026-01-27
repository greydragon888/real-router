// packages/core/src/namespaces/CloneNamespace/CloneNamespace.ts

import type { RouteConfig } from "../RoutesNamespace";
import type {
  ActivationFnFactory,
  DefaultDependencies,
  MiddlewareFactory,
  Options,
  PluginFactory,
  Route,
  Router as RouterInterface,
} from "@real-router/types";

/**
 * Data collected from source router for cloning.
 */
export interface CloneData<Dependencies extends DefaultDependencies> {
  routes: Route<Dependencies>[];
  options: Options;
  dependencies: Partial<Dependencies>;
  canDeactivateFactories: Record<string, ActivationFnFactory<Dependencies>>;
  canActivateFactories: Record<string, ActivationFnFactory<Dependencies>>;
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
) => RouterInterface<Dependencies>;

/**
 * Function to apply route config to a new router.
 */
export type ApplyConfigFn = (
  router: RouterInterface,
  config: RouteConfig,
  resolvedForwardMap: Record<string, string>,
) => void;

/**
 * Independent namespace for router cloning operations.
 *
 * This namespace handles the logic of collecting data from a source router
 * and creating a configured clone. It requires a factory function to create
 * the new router instance.
 */
export class CloneNamespace<
  Dependencies extends DefaultDependencies = DefaultDependencies,
> {
  /**
   * Reference to the source router.
   */
  #router: RouterInterface<Dependencies> | undefined;

  /**
   * Function to get cloning data from the source router.
   */
  #getCloneData: (() => CloneData<Dependencies>) | undefined;

  /**
   * Function to apply config to a new router.
   */
  #applyConfig: ApplyConfigFn | undefined;

  /**
   * Sets the router reference and cloning functions.
   */
  setRouter(
    router: RouterInterface<Dependencies>,
    getCloneData: () => CloneData<Dependencies>,
    applyConfig: ApplyConfigFn,
  ): void {
    this.#router = router;
    this.#getCloneData = getCloneData;
    this.#applyConfig = applyConfig;
  }

  /**
   * Creates a clone of the router with optional new dependencies.
   *
   * @param dependencies - Optional new dependencies for the cloned router
   * @param factory - Factory function to create the new router instance
   */
  clone(
    dependencies: Dependencies | undefined,
    factory: RouterFactory<Dependencies>,
  ): RouterInterface<Dependencies> {
    /* c8 ignore next 4 -- defensive check, always set by Router */
    if (!this.#router || !this.#getCloneData || !this.#applyConfig) {
      throw new Error(
        `[CloneNamespace] Router not set. Call setRouter() first.`,
      );
    }

    // Collect all data from source router
    const data = this.#getCloneData();

    // Merge dependencies
    const mergedDeps = {
      ...data.dependencies,
      ...dependencies,
    } as Dependencies;

    // Create new router instance
    const newRouter = factory(data.routes, data.options, mergedDeps);

    // Copy lifecycle factories
    for (const [name, handler] of Object.entries(data.canDeactivateFactories)) {
      newRouter.canDeactivate(name, handler);
    }

    for (const [name, handler] of Object.entries(data.canActivateFactories)) {
      newRouter.canActivate(name, handler);
    }

    // Copy middleware factories
    if (data.middlewareFactories.length > 0) {
      newRouter.useMiddleware(...data.middlewareFactories);
    }

    // Copy plugin factories
    if (data.pluginFactories.length > 0) {
      newRouter.usePlugin(...data.pluginFactories);
    }

    // Apply route config (decoders, encoders, defaultParams, forwardMap)
    this.#applyConfig(
      newRouter as unknown as RouterInterface,
      data.routeConfig,
      data.resolvedForwardMap,
    );

    return newRouter;
  }
}
