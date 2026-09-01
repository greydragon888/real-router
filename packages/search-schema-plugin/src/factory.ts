import { getPluginApi, getRoutesApi } from "@real-router/core/api";

import { SearchSchemaPlugin } from "./plugin";
import { validateOptions } from "./validation";

import type { SearchSchemaPluginOptions } from "./types";
import type { PluginFactory, Plugin } from "@real-router/core";

/** Captured like the deciding seven, but this one BUILDS the guarantee (#2073). */
const freeze = Object.freeze;

export function searchSchemaPlugin(
  options: SearchSchemaPluginOptions = {},
): PluginFactory {
  validateOptions(options);

  const frozenOptions: SearchSchemaPluginOptions = freeze({
    ...options,
  });

  return (router): Plugin => {
    const pluginApi = getPluginApi(router);
    const routesApi = getRoutesApi(router);
    const plugin = new SearchSchemaPlugin(pluginApi, routesApi, frozenOptions);

    return plugin.getPlugin();
  };
}
