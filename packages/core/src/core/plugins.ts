// packages/real-router/modules/core/plugins.ts

import { isObjKey } from "type-guards";

import { events as EVENTS_CONST, plugins as PLUGINS_CONST } from "../constants";
import { getTypeDescription } from "../helpers";

import type {
  EventName,
  Unsubscribe,
  Router,
  Plugin,
  PluginFactory,
  DefaultDependencies,
} from "core-types";

type EventMappingType = Record<
  (typeof PLUGINS_CONST)[keyof typeof PLUGINS_CONST],
  EventName
>;

const LOGGER_CONTEXT_FOR_PLUGINS = "router.usePlugin";

const eventsMap = {
  [PLUGINS_CONST.ROUTER_START]: EVENTS_CONST.ROUTER_START,
  [PLUGINS_CONST.ROUTER_STOP]: EVENTS_CONST.ROUTER_STOP,
  [PLUGINS_CONST.TRANSITION_SUCCESS]: EVENTS_CONST.TRANSITION_SUCCESS,
  [PLUGINS_CONST.TRANSITION_START]: EVENTS_CONST.TRANSITION_START,
  [PLUGINS_CONST.TRANSITION_ERROR]: EVENTS_CONST.TRANSITION_ERROR,
  [PLUGINS_CONST.TRANSITION_CANCEL]: EVENTS_CONST.TRANSITION_CANCEL,
} as const satisfies EventMappingType;

const EVENT_METHOD_NAMES = Object.keys(eventsMap).filter(
  (eventName): eventName is keyof typeof eventsMap =>
    isObjKey<typeof eventsMap>(eventName, eventsMap),
);

const PLUGIN_LIMITS = {
  WARN: 10,
  ERROR: 25,
  HARD_LIMIT: 50,
};

const validatePluginsSize = (
  newPluginsSize: number,
  registeredPluginsSize: number,
) => {
  // Check total size BEFORE initialization to fail fast
  const newSize = newPluginsSize + registeredPluginsSize;

  // Hard limit: more than 50 plugins indicates architectural problem
  if (newSize > PLUGIN_LIMITS.HARD_LIMIT) {
    throw new Error(
      `[router.usePlugin] Plugin limit exceeded (${PLUGIN_LIMITS.HARD_LIMIT})`,
    );
  }

  // Graduated warnings for early problem detection
  if (newSize >= PLUGIN_LIMITS.ERROR) {
    console.error(
      `[${LOGGER_CONTEXT_FOR_PLUGINS}] ${newSize} plugins registered!`,
    );
  } else if (newSize >= PLUGIN_LIMITS.WARN) {
    console.warn(
      `[${LOGGER_CONTEXT_FOR_PLUGINS}] ${newSize} plugins registered`,
    );
  }
};

const validateAppliedPlugin = (plugin: Plugin) => {
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
    if (!(key === "teardown" || isObjKey<typeof eventsMap>(key, eventsMap))) {
      throw new TypeError(
        `[router.usePlugin] Unknown property '${key}'. ` +
          `Plugin must only contain event handlers and optional teardown.`,
      );
    }
  }
};

/**
 * Validates plugin batch and returns deduplicated set.
 * Throws if any plugin is invalid or already registered.
 */
function validatePluginBatch<Dependencies extends DefaultDependencies>(
  plugins: PluginFactory<Dependencies>[],
  registeredPlugins: Set<PluginFactory<Dependencies>>,
): Set<PluginFactory<Dependencies>> {
  const seenInBatch = new Set<PluginFactory<Dependencies>>();

  for (const plugin of plugins) {
    if (typeof plugin !== "function") {
      throw new TypeError(
        `[router.usePlugin] Expected plugin factory function, got ${typeof plugin}`,
      );
    }

    if (registeredPlugins.has(plugin)) {
      throw new Error(
        `[router.usePlugin] Plugin factory already registered. ` +
          `To re-register, first unsubscribe the existing plugin.`,
      );
    }

    if (seenInBatch.has(plugin)) {
      console.warn(
        `[${LOGGER_CONTEXT_FOR_PLUGINS}] Duplicate factory in batch, will be registered once`,
      );
    } else {
      seenInBatch.add(plugin);
    }
  }

  return seenInBatch;
}

export function withPlugins<
  Dependencies extends DefaultDependencies = DefaultDependencies,
>(router: Router<Dependencies>): Router<Dependencies> {
  const routerPlugins = new Set<PluginFactory<Dependencies>>();

  /**
   * Returns registered plugin factories
   *
   * @internal Used by router.clone(). Will be removed from public API.
   * @deprecated Use behavior testing instead of checking internal state
   */
  router.getPlugins = (): PluginFactory<Dependencies>[] => [...routerPlugins];

  /**
   * Registers one or more plugins in the router
   * Plugins can subscribe to router lifecycle events
   *
   * @returns Unsubscribe function that removes all added plugins
   */
  router.usePlugin = (
    ...plugins: PluginFactory<Dependencies>[]
  ): Unsubscribe => {
    // Prevent exceeding plugin limit (50 max)
    validatePluginsSize(plugins.length, routerPlugins.size);

    // Validate ALL plugins before any state changes (atomicity)
    const seenInBatch = validatePluginBatch(plugins, routerPlugins);

    // Track successfully initialized plugins for cleanup
    const initializedPlugins: {
      factory: PluginFactory<Dependencies>;
      cleanup: Unsubscribe;
    }[] = [];

    // Initialize deduplicated plugins sequentially
    try {
      for (const plugin of seenInBatch) {
        const cleanup = startPlugin(plugin);

        initializedPlugins.push({ factory: plugin, cleanup });
      }
    } catch (error) {
      // Rollback on failure - cleanup all initialized plugins
      for (const { cleanup } of initializedPlugins) {
        try {
          cleanup();
        } catch (cleanupError) {
          console.error(
            `[${LOGGER_CONTEXT_FOR_PLUGINS}] Cleanup error:`,
            cleanupError,
          );
        }
      }

      throw error;
    }

    // Commit phase - add to registry
    for (const { factory } of initializedPlugins) {
      routerPlugins.add(factory);
    }

    // Return unsubscribe function - each call manages only its own plugins
    let unsubscribed = false;

    return () => {
      if (unsubscribed) {
        return;
      }

      unsubscribed = true;

      // Remove only plugins added in THIS call
      for (const { factory } of initializedPlugins) {
        routerPlugins.delete(factory);
      }

      // Cleanup all plugins from this call
      for (const { cleanup } of initializedPlugins) {
        try {
          cleanup();
        } catch (error) {
          console.error(
            `[${LOGGER_CONTEXT_FOR_PLUGINS}] Error during cleanup:`,
            error,
          );
        }
      }
    };
  };

  /**
   * Initializes a single plugin and subscribes it to router events
   *
   * @param pluginFactory - Factory function to create plugin
   * @returns Composite cleanup function that unsubscribes from all events
   */
  function startPlugin(
    pluginFactory: PluginFactory<Dependencies>,
  ): Unsubscribe {
    // Create plugin instance with router context
    const appliedPlugin = pluginFactory(router, router.getDependency);

    validateAppliedPlugin(appliedPlugin);

    Object.freeze(appliedPlugin);

    // Collect all unsubscribe functions
    const removeEventListeners: Unsubscribe[] = [];

    // Subscribe plugin methods to corresponding router events
    for (const methodName of EVENT_METHOD_NAMES) {
      if (methodName in appliedPlugin) {
        if (typeof appliedPlugin[methodName] === "function") {
          removeEventListeners.push(
            router.addEventListener(
              eventsMap[methodName],
              appliedPlugin[methodName],
            ),
          );

          if (methodName === PLUGINS_CONST.ROUTER_START && router.isStarted()) {
            console.warn(
              `[${LOGGER_CONTEXT_FOR_PLUGINS}] Router already started, onStart will not be called`,
            );
          }
        } else {
          console.warn(
            `[${LOGGER_CONTEXT_FOR_PLUGINS}] Property '${methodName}' is not a function, skipping`,
          );
        }
      }
    }

    // Return composite cleanup function
    return () => {
      // Unsubscribe from all events
      removeEventListeners.forEach((removeListener) => {
        removeListener();
      });

      // Call plugin's custom teardown if exists
      if (typeof appliedPlugin.teardown === "function") {
        appliedPlugin.teardown();
      }
    };
  }

  return router;
}
