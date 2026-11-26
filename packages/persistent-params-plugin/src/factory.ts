// packages/persistent-params-plugin/src/factory.ts

import { getPluginApi } from "@real-router/core/api";
import { copyFields, putField } from "@real-router/core/utils";

import { ERROR_PREFIX } from "./constants";
import { PersistentParamsPlugin } from "./plugin";
import { validateConfig } from "./validation";

import type { PersistentParamsConfig } from "./types";
import type { Params, PluginFactory, Plugin } from "@real-router/core";

/** Captured like the deciding seven, but this one BUILDS the guarantee (#2073). */
const freeze = Object.freeze;

/**
 * Intrinsics captured at module load (#1971).
 *
 * ⚑ These DECIDE — each answers "what is on this object" for a value this module
 * did not build, so read off the live global they are the weakest point of every
 * check built on them. `guards.ts` states the doctrine and its measurement: one
 * naive `Object.hasOwn` polyfill walked straight through five sibling readers
 * while the single captured guard held.
 *
 * ⚠ Capture narrows the window from "any time after boot" to "before this module
 * loads". It does not close it — a shim evaluated ahead of core still wins
 * (#1798), which is the doctrine's own caveat and travels with it.
 */
const objectKeys = Object.keys;

/**
 * The routers this plugin is registered on (#2974), with any config, the empty
 * one included. A second registration on one of them throws before it
 * registers anything, and teardown takes the router out.
 * `tests/functional/reregistration-2974.test.ts` holds the cells.
 */
const REGISTERED = new WeakSet<object>();

function refuseRepeat(router: object): void {
  if (REGISTERED.has(router)) {
    throw new Error(
      `${ERROR_PREFIX} is already registered on this router — a clone already carries the plugins of its base router`,
    );
  }
}

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
 * @throws {Error} From the returned factory, if the plugin is already registered on the router
 */
export function persistentParamsPluginFactory(
  params: PersistentParamsConfig = {},
): PluginFactory {
  validateConfig(params);

  const paramNames = Array.isArray(params) ? params : objectKeys(params);

  if (paramNames.length === 0) {
    return (router): Plugin => {
      refuseRepeat(router);
      REGISTERED.add(router);

      return {
        teardown: () => {
          REGISTERED.delete(router);
        },
      };
    };
  }

  const initialParams: Params = {};

  if (Array.isArray(params)) {
    for (const param of params) {
      // ⚑ The name comes from the plugin's own CONFIG, so it is exactly the kind
      // of ordinary word an application may already carry on `Object.prototype`:
      // a route configured under `lang` against an extended `Object.prototype.lang`
      // makes a bare `[[Set]]` throw here, at boot (#1852). `copyFields` in the
      // else branch is the same guard for a whole record — `Object.assign` there
      // would be the hazard written differently, copying with `[[Set]]` one key
      // at a time.
      putField(initialParams, param, undefined);
    }
  } else {
    copyFields(initialParams, params);
  }

  freeze(initialParams);

  const paramNamesSet = new Set<string>(paramNames);

  return (router): Plugin => {
    refuseRepeat(router);

    const api = getPluginApi(router);
    const plugin = new PersistentParamsPlugin(
      api,
      initialParams,
      new Set(paramNamesSet),
      api.getRootPath(),
    ).getPlugin();

    REGISTERED.add(router);

    return {
      ...plugin,
      teardown: () => {
        REGISTERED.delete(router);

        return plugin.teardown?.();
      },
    };
  };
}
