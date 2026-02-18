// packages/core/src/namespaces/PluginsNamespace/PluginsNamespace.ts

import { logger } from "@real-router/logger";

import { EVENTS_MAP, EVENT_METHOD_NAMES, LOGGER_CONTEXT } from "./constants";
import {
  validatePlugin,
  validatePluginLimit,
  validateUsePluginArgs,
} from "./validators";
import { DEFAULT_LIMITS } from "../../constants";
import { computeThresholds } from "../../helpers";

import type { PluginsDependencies } from "./types";
import type { Router } from "../../Router";
import type { Limits, PluginFactory } from "../../types";
import type {
  DefaultDependencies,
  Plugin,
  Unsubscribe,
} from "@real-router/types";

/**
 * Independent namespace for managing plugins.
 *
 * Static methods handle validation (called by facade).
 * Instance methods handle storage and business logic.
 */
export class PluginsNamespace<
  Dependencies extends DefaultDependencies = DefaultDependencies,
> {
  readonly #plugins = new Set<PluginFactory<Dependencies>>();
  readonly #unsubscribes = new Set<Unsubscribe>();

  #routerStore: Router<Dependencies> | undefined;
  #depsStore: PluginsDependencies<Dependencies> | undefined;
  #limits: Limits = DEFAULT_LIMITS;

  /**
   * Gets router or throws if not initialized.
   */
  get #router(): Router<Dependencies> {
    /* v8 ignore next 3 -- @preserve: router always set by Router.ts */
    if (!this.#routerStore) {
      throw new Error("[real-router] PluginsNamespace: router not initialized");
    }

    return this.#routerStore;
  }

  /**
   * Gets dependencies or throws if not initialized.
   */
  get #deps(): PluginsDependencies<Dependencies> {
    /* v8 ignore next 3 -- @preserve: deps always set by Router.ts */
    if (!this.#depsStore) {
      throw new Error(
        "[real-router] PluginsNamespace: dependencies not initialized",
      );
    }

    return this.#depsStore;
  }

  // =========================================================================
  // Static validation methods (called by facade before instance methods)
  // Proxy to functions in validators.ts for separation of concerns
  // =========================================================================

  static validateUsePluginArgs<D extends DefaultDependencies>(
    plugins: unknown[],
  ): asserts plugins is PluginFactory<D>[] {
    validateUsePluginArgs<D>(plugins);
  }

  static validatePlugin(plugin: Plugin): void {
    validatePlugin(plugin);
  }

  static validatePluginLimit(
    currentCount: number,
    newCount: number,
    maxPlugins?: number,
  ): void {
    validatePluginLimit(currentCount, newCount, maxPlugins);
  }

  static validateNoDuplicatePlugins<D extends DefaultDependencies>(
    newFactories: PluginFactory<D>[],
    hasPlugin: (factory: PluginFactory<D>) => boolean,
  ): void {
    for (const factory of newFactories) {
      if (hasPlugin(factory)) {
        throw new Error(
          `[router.usePlugin] Plugin factory already registered. ` +
            `To re-register, first unsubscribe the existing plugin.`,
        );
      }
    }
  }

  // =========================================================================
  // Dependency injection
  // =========================================================================

  setRouter(router: Router<Dependencies>): void {
    this.#routerStore = router;
  }

  setDependencies(deps: PluginsDependencies<Dependencies>): void {
    this.#depsStore = deps;
  }

  setLimits(limits: Limits): void {
    this.#limits = limits;
  }

  // =========================================================================
  // Instance methods (trust input - already validated by facade)
  // =========================================================================

  /**
   * Returns the number of registered plugins.
   * Used by facade for limit validation.
   */
  count(): number {
    return this.#plugins.size;
  }

  /**
   * Registers one or more plugin factories.
   * Returns unsubscribe function to remove all added plugins.
   * Input already validated by facade (limit, duplicates).
   *
   * @param factories - Already validated by facade
   */
  use(...factories: PluginFactory<Dependencies>[]): Unsubscribe {
    // Emit warnings for count thresholds (not validation, just warnings)
    this.#checkCountThresholds(factories.length);

    // Fast path for single plugin (common case)
    if (factories.length === 1) {
      const factory = factories[0];
      const cleanup = this.#startPlugin(factory);

      this.#plugins.add(factory);

      let unsubscribed = false;

      const unsubscribe: Unsubscribe = () => {
        if (unsubscribed) {
          return;
        }

        unsubscribed = true;
        this.#plugins.delete(factory);
        this.#unsubscribes.delete(unsubscribe);
        try {
          cleanup();
        } catch (error) {
          logger.error(LOGGER_CONTEXT, "Error during cleanup:", error);
        }
      };

      this.#unsubscribes.add(unsubscribe);

      return unsubscribe;
    }

    // Deduplicate batch with warning (validation already done by facade)
    const seenInBatch = this.#deduplicateBatch(factories);

    // Track successfully initialized plugins for cleanup
    const initializedPlugins: {
      factory: PluginFactory<Dependencies>;
      cleanup: Unsubscribe;
    }[] = [];

    // Initialize deduplicated plugins sequentially
    try {
      for (const plugin of seenInBatch) {
        const cleanup = this.#startPlugin(plugin);

        initializedPlugins.push({ factory: plugin, cleanup });
      }
    } catch (error) {
      // Rollback on failure - cleanup all initialized plugins
      for (const { cleanup } of initializedPlugins) {
        try {
          cleanup();
        } catch (cleanupError) {
          logger.error(LOGGER_CONTEXT, "Cleanup error:", cleanupError);
        }
      }

      throw error;
    }

    // Commit phase - add to registry
    for (const { factory } of initializedPlugins) {
      this.#plugins.add(factory);
    }

    // Return unsubscribe function
    let unsubscribed = false;

    const unsubscribe: Unsubscribe = () => {
      if (unsubscribed) {
        return;
      }

      unsubscribed = true;
      this.#unsubscribes.delete(unsubscribe);

      for (const { factory } of initializedPlugins) {
        this.#plugins.delete(factory);
      }

      for (const { cleanup } of initializedPlugins) {
        try {
          cleanup();
        } catch (error) {
          logger.error(LOGGER_CONTEXT, "Error during cleanup:", error);
        }
      }
    };

    this.#unsubscribes.add(unsubscribe);

    return unsubscribe;
  }

  /**
   * Returns registered plugin factories.
   */
  getAll(): PluginFactory<Dependencies>[] {
    return [...this.#plugins];
  }

  /**
   * Checks if a plugin factory is registered.
   * Used internally by validation to avoid array allocation.
   */
  has(factory: PluginFactory<Dependencies>): boolean {
    return this.#plugins.has(factory);
  }

  disposeAll(): void {
    for (const unsubscribe of this.#unsubscribes) {
      try {
        unsubscribe();
        // eslint-disable-next-line no-empty
      } catch {}
    }

    this.#plugins.clear();
    this.#unsubscribes.clear();
  }

  // =========================================================================
  // Private methods
  // =========================================================================

  #checkCountThresholds(newCount: number): void {
    const maxPlugins = this.#limits.maxPlugins;

    if (maxPlugins === 0) {
      return;
    }

    const totalCount = newCount + this.#plugins.size;

    const { warn, error } = computeThresholds(maxPlugins);

    if (totalCount >= error) {
      logger.error(LOGGER_CONTEXT, `${totalCount} plugins registered!`);
    } else if (totalCount >= warn) {
      logger.warn(LOGGER_CONTEXT, `${totalCount} plugins registered`);
    }
  }

  /**
   * Deduplicates batch with warning for duplicates within batch.
   * Validation (existing duplicates) is done by facade.
   */
  #deduplicateBatch(
    plugins: PluginFactory<Dependencies>[],
  ): Set<PluginFactory<Dependencies>> {
    const seenInBatch = new Set<PluginFactory<Dependencies>>();

    for (const plugin of plugins) {
      if (seenInBatch.has(plugin)) {
        logger.warn(
          LOGGER_CONTEXT,
          "Duplicate factory in batch, will be registered once",
        );
      } else {
        seenInBatch.add(plugin);
      }
    }

    return seenInBatch;
  }

  #startPlugin(pluginFactory: PluginFactory<Dependencies>): Unsubscribe {
    // Bind getDependency to preserve 'this' context when called from factory
    // Plugin factories receive full router as part of their public API
    const appliedPlugin = pluginFactory(this.#router, this.#deps.getDependency);

    PluginsNamespace.validatePlugin(appliedPlugin);

    Object.freeze(appliedPlugin);

    // Collect all unsubscribe functions
    const removeEventListeners: Unsubscribe[] = [];

    // Subscribe plugin methods to corresponding router events
    for (const methodName of EVENT_METHOD_NAMES) {
      if (methodName in appliedPlugin) {
        if (typeof appliedPlugin[methodName] === "function") {
          removeEventListeners.push(
            this.#deps.addEventListener(
              EVENTS_MAP[methodName],
              appliedPlugin[methodName],
            ),
          );

          if (methodName === "onStart" && this.#deps.canNavigate()) {
            logger.warn(
              LOGGER_CONTEXT,
              "Router already started, onStart will not be called",
            );
          }
        } else {
          logger.warn(
            LOGGER_CONTEXT,
            `Property '${methodName}' is not a function, skipping`,
          );
        }
      }
    }

    // Return composite cleanup function
    return () => {
      for (const removeListener of removeEventListeners) {
        removeListener();
      }

      if (typeof appliedPlugin.teardown === "function") {
        appliedPlugin.teardown();
      }
    };
  }
}
