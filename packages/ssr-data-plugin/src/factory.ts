import { getPluginApi } from "@real-router/core/api";

import { validateLoaders } from "./validation";

import type { DataLoaderMap } from "./types";
import type { State, PluginFactory, Plugin } from "@real-router/core";

export function ssrDataPluginFactory(loaders: DataLoaderMap): PluginFactory {
  validateLoaders(loaders);

  return (router): Plugin => {
    const api = getPluginApi(router);
    const dataStore = new WeakMap<State, unknown>();

    const removeStartInterceptor = api.addInterceptor(
      "start",
      async (next, path) => {
        const state = await next(path);

        if (Object.hasOwn(loaders, state.name)) {
          dataStore.set(state, await loaders[state.name](state.params));
        }

        return state;
      },
    );

    const removeExtensions = api.extendRouter({
      getRouteData(state?: State): unknown {
        const routeState = state ?? router.getState();

        return routeState ? (dataStore.get(routeState) ?? null) : null;
      },
    });

    return {
      teardown() {
        removeStartInterceptor();
        removeExtensions();
      },
    };
  };
}
