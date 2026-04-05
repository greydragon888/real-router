import { getPluginApi, getRoutesApi } from "@real-router/core/api";

import { SearchSchemaPlugin } from "./plugin";
import { validateOptions } from "./validation";

import type { SearchSchemaPluginOptions } from "./types";
import type { PluginFactory, Plugin } from "@real-router/core";

export function searchSchemaPlugin(
  options: SearchSchemaPluginOptions = {},
): PluginFactory {
  validateOptions(options);

  const frozenOptions: SearchSchemaPluginOptions = Object.freeze({
    ...options,
  });

  return (router): Plugin => {
    const pluginApi = getPluginApi(router);
    const routesApi = getRoutesApi(router);
    const plugin = new SearchSchemaPlugin(pluginApi, routesApi, frozenOptions);

    return plugin.getPlugin();
  };
}
