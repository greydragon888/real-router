// packages/core/src/namespaces/CloneNamespace/CloneNamespace.ts

import { getTypeDescription } from "type-guards";

import type { ApplyConfigFn, CloneData, RouterFactory } from "./types";
import type { Router } from "../../Router";
import type { DefaultDependencies } from "@real-router/types";

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
  // =========================================================================
  // Instance fields
  // =========================================================================

  /**
   * Function to get cloning data from the source router.
   */
  #getCloneData!: () => CloneData<Dependencies>;

  // =========================================================================
  // Static validation methods (called by facade before instance methods)
  // =========================================================================

  /**
   * Validates clone arguments.
   * Dependencies can be undefined or a plain object without getters.
   */
  static validateCloneArgs(dependencies: unknown): void {
    // undefined is valid (no new dependencies)
    if (dependencies === undefined) {
      return;
    }

    // Must be a plain object
    if (
      !(
        dependencies &&
        typeof dependencies === "object" &&
        dependencies.constructor === Object
      )
    ) {
      throw new TypeError(
        `[router.clone] Invalid dependencies: expected plain object or undefined, received ${getTypeDescription(dependencies)}`,
      );
    }

    // Getters can throw, return different values, or have side effects
    for (const key in dependencies) {
      if (Object.getOwnPropertyDescriptor(dependencies, key)?.get) {
        throw new TypeError(
          `[router.clone] Getters not allowed in dependencies: "${key}"`,
        );
      }
    }
  }

  /**
   * Sets the function to collect clone data.
   */
  setGetCloneData(getCloneData: () => CloneData<Dependencies>): void {
    this.#getCloneData = getCloneData;
  }

  /**
   * Creates a clone of the router with optional new dependencies.
   *
   * @param dependencies - Optional new dependencies for the cloned router
   * @param factory - Factory function to create the new router instance
   * @param applyConfig - Function to apply route config to the new router
   */
  clone(
    dependencies: Dependencies | undefined,
    factory: RouterFactory<Dependencies>,
    applyConfig: ApplyConfigFn<Dependencies>,
  ): Router<Dependencies> {
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
      newRouter.addDeactivateGuard(name, handler);
    }

    for (const [name, handler] of Object.entries(data.canActivateFactories)) {
      newRouter.addActivateGuard(name, handler);
    }

    // Copy plugin factories
    if (data.pluginFactories.length > 0) {
      newRouter.usePlugin(...data.pluginFactories);
    }

    // Apply route config (decoders, encoders, defaultParams, forwardMap)
    applyConfig(
      newRouter,
      data.routeConfig,
      data.resolvedForwardMap,
      data.routeCustomFields,
    );

    return newRouter;
  }
}
