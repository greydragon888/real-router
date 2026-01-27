// packages/core/src/namespaces/PluginsNamespace/PluginsNamespace.ts

import { logger } from "@real-router/logger";
import { isObjKey } from "type-guards";

import { PLUGIN_LIMITS, EVENTS_MAP, EVENT_METHOD_NAMES } from "./constants";
import { getTypeDescription } from "../../helpers";

import type {
  DefaultDependencies,
  Plugin,
  PluginFactory,
  Router,
  Unsubscribe,
} from "@real-router/types";

const LOGGER_CONTEXT = "router.usePlugin";

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

  // Router reference for plugin initialization (set after construction)
  #router: Router<Dependencies> | undefined;

  // =========================================================================
  // Static validation methods (called by facade before instance methods)
  // =========================================================================

  /**
   * Validates usePlugin arguments.
   */
  static validateUsePluginArgs<D extends DefaultDependencies>(
    plugins: unknown[],
  ): asserts plugins is PluginFactory<D>[] {
    for (const plugin of plugins) {
      if (typeof plugin !== "function") {
        throw new TypeError(
          `[router.usePlugin] Expected plugin factory function, got ${typeof plugin}`,
        );
      }
    }
  }

  /**
   * Validates that a plugin factory returned a valid plugin object.
   */
  static validatePlugin(plugin: Plugin): void {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!(plugin && typeof plugin === "object") || Array.isArray(plugin)) {
      throw new TypeError(
        `[router.usePlugin] Plugin factory must return an object, got ${getTypeDescription(
          plugin,
        )}`,
      );
    }

    // Detect async factory (returns Promise)
    if (typeof (plugin as unknown as { then?: unknown }).then === "function") {
      throw new TypeError(
        `[router.usePlugin] Async plugin factories are not supported. ` +
          `Factory returned a Promise instead of a plugin object.`,
      );
    }

    for (const key in plugin) {
      if (
        !(key === "teardown" || isObjKey<typeof EVENTS_MAP>(key, EVENTS_MAP))
      ) {
        throw new TypeError(
          `[router.usePlugin] Unknown property '${key}'. ` +
            `Plugin must only contain event handlers and optional teardown.`,
        );
      }
    }
  }

  // =========================================================================
  // Dependency injection
  // =========================================================================

  /**
   * Sets the router reference for plugin initialization.
   * Must be called before registering any plugins.
   */
  setRouter(router: Router<Dependencies>): void {
    this.#router = router;
  }

  // =========================================================================
  // Instance methods (trust input - already validated by facade)
  // =========================================================================

  /**
   * Registers one or more plugin factories.
   * Returns unsubscribe function to remove all added plugins.
   *
   * @param factories - Already validated by facade
   */
  use(...factories: PluginFactory<Dependencies>[]): Unsubscribe {
    // Check limits
    this.#validateCount(factories.length);

    // Validate batch and get deduplicated set
    const seenInBatch = this.#validateBatch(factories);

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

    return () => {
      if (unsubscribed) {
        return;
      }

      unsubscribed = true;

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
  }

  /**
   * Returns registered plugin factories.
   */
  getAll(): PluginFactory<Dependencies>[] {
    return [...this.#plugins];
  }

  // =========================================================================
  // Private methods
  // =========================================================================

  #validateCount(newCount: number): void {
    const newSize = newCount + this.#plugins.size;

    if (newSize > PLUGIN_LIMITS.HARD_LIMIT) {
      throw new Error(
        `[router.usePlugin] Plugin limit exceeded (${PLUGIN_LIMITS.HARD_LIMIT})`,
      );
    }

    if (newSize >= PLUGIN_LIMITS.ERROR) {
      logger.error(LOGGER_CONTEXT, `${newSize} plugins registered!`);
    } else if (newSize >= PLUGIN_LIMITS.WARN) {
      logger.warn(LOGGER_CONTEXT, `${newSize} plugins registered`);
    }
  }

  #validateBatch(
    plugins: PluginFactory<Dependencies>[],
  ): Set<PluginFactory<Dependencies>> {
    const seenInBatch = new Set<PluginFactory<Dependencies>>();

    for (const plugin of plugins) {
      if (this.#plugins.has(plugin)) {
        throw new Error(
          `[router.usePlugin] Plugin factory already registered. ` +
            `To re-register, first unsubscribe the existing plugin.`,
        );
      }

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
    // Router is guaranteed to be set at this point
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const router = this.#router!;
    // Bind getDependency to preserve 'this' context when called from factory
    const appliedPlugin = pluginFactory(
      router,
      router.getDependency.bind(router),
    );

    PluginsNamespace.validatePlugin(appliedPlugin);

    Object.freeze(appliedPlugin);

    // Collect all unsubscribe functions
    const removeEventListeners: Unsubscribe[] = [];

    // Subscribe plugin methods to corresponding router events
    for (const methodName of EVENT_METHOD_NAMES) {
      if (methodName in appliedPlugin) {
        if (typeof appliedPlugin[methodName] === "function") {
          removeEventListeners.push(
            router.addEventListener(
              EVENTS_MAP[methodName],
              appliedPlugin[methodName],
            ),
          );

          if (methodName === "onStart" && router.isStarted()) {
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
