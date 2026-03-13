// packages/persistent-params-plugin/src/factory.ts

import { getPluginApi } from "@real-router/core/api";

import { PersistentParamsPlugin } from "./plugin";
import { validateConfig } from "./validation";

import type { PersistentParamsConfig } from "./types";
import type { Params, PluginFactory, Plugin } from "@real-router/core";

// Shared singleton — frozen by core on first use. Do not add properties.
const EMPTY_PLUGIN: Plugin = {};
const noop: PluginFactory = () => EMPTY_PLUGIN;

/**
 * Factory for the persistent parameters' plugin.
 *
 * This plugin allows you to specify certain route parameters to be persisted across
 * all navigation transitions. Persisted parameters are automatically merged into
 * route parameters when building paths or states.
 *
 * Key features:
 * - Automatic persistence of query parameters across navigations
 * - Support for default values
 * - Type-safe (only primitives: string, number, boolean)
 * - Immutable internal state
 * - Protection against prototype pollution
 * - Full teardown support (can be safely unsubscribed)
 *
 * If a persisted parameter is explicitly set to `undefined` during navigation,
 * it will be removed from the persisted state and omitted from subsequent URLs.
 *
 * The plugin also adjusts the router's root path to include query parameters for
 * all persistent params, ensuring correct URL construction.
 *
 * @param params - Either an array of parameter names (strings) to persist,
 *                 or an object mapping parameter names to initial values.
 *                 If an array, initial values will be `undefined`.
 *
 * @returns A PluginFactory that creates the persistent params plugin instance.
 *
 * @example
 * // Persist parameters without default values
 * router.usePlugin(persistentParamsPlugin(['mode', 'lang']));
 *
 * @example
 * // Persist parameters with default values
 * router.usePlugin(persistentParamsPlugin({ mode: 'dev', lang: 'en' }));
 *
 * @example
 * // Removing a persisted parameter
 * router.navigate('route', { mode: undefined }); // mode will be removed
 *
 * @example
 * // Unsubscribing (full cleanup)
 * const unsubscribe = router.usePlugin(persistentParamsPlugin(['mode']));
 * unsubscribe(); // Restores original router state
 *
 * @throws {TypeError} If params is not a valid array of strings or object with primitives
 * @throws {Error} If plugin is already initialized on this router instance
 */
export function persistentParamsPluginFactory(
  params: PersistentParamsConfig = {},
): PluginFactory {
  validateConfig(params);

  const paramNames = Array.isArray(params) ? params : Object.keys(params);

  if (paramNames.length === 0) {
    return noop;
  }

  const initialParams: Params = {};

  if (Array.isArray(params)) {
    for (const param of params) {
      initialParams[param] = undefined;
    }
  } else {
    Object.assign(initialParams, params);
  }

  Object.freeze(initialParams);

  const paramNamesSet = new Set<string>(paramNames);

  return (router): Plugin => {
    const api = getPluginApi(router);
    const plugin = new PersistentParamsPlugin(
      api,
      initialParams,
      new Set(paramNamesSet),
      api.getRootPath(),
    );

    return plugin.getPlugin();
  };
}
