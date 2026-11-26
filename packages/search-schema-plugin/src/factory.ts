import { getPluginApi, getRoutesApi } from "@real-router/core/api";

import { ERROR_PREFIX } from "./constants";
import { SearchSchemaPlugin } from "./plugin";
import { validateOptions } from "./validation";

import type { SearchSchemaPluginOptions } from "./types";
import type { PluginFactory, Plugin } from "@real-router/core";

/** Captured like the deciding seven, but this one BUILDS the guarantee (#2073). */
const freeze = Object.freeze;

/**
 * The routers this plugin is registered on (#2974). A second registration on
 * one of them throws before it registers anything, and teardown takes the
 * router out. `tests/functional/reregistration-2974.test.ts` holds the cells.
 */
const REGISTERED = new WeakSet<object>();

export function searchSchemaPlugin(
  options: SearchSchemaPluginOptions = {},
): PluginFactory {
  validateOptions(options);

  const frozenOptions: SearchSchemaPluginOptions = freeze({
    ...options,
  });

  return (router): Plugin => {
    if (REGISTERED.has(router)) {
      throw new Error(
        `${ERROR_PREFIX} is already registered on this router — a clone already carries the plugins of its base router`,
      );
    }

    const pluginApi = getPluginApi(router);
    const routesApi = getRoutesApi(router);
    const plugin = new SearchSchemaPlugin(
      pluginApi,
      routesApi,
      frozenOptions,
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
