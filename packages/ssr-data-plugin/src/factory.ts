import { getPluginApi } from "@real-router/core/api";

import { validateLoaders } from "./validation";

import type { DataLoaderMap } from "./types";
import type { PluginFactory, Plugin } from "@real-router/core";

export function ssrDataPluginFactory(loaders: DataLoaderMap): PluginFactory {
  validateLoaders(loaders);

  return (router): Plugin => {
    const api = getPluginApi(router);
    const claim = api.claimContextNamespace("data");

    const removeStartInterceptor = api.addInterceptor(
      "start",
      async (next, path) => {
        const state = await next(path);

        if (Object.hasOwn(loaders, state.name)) {
          claim.write(state, await loaders[state.name](state.params));
        }

        return state;
      },
    );

    return {
      teardown() {
        removeStartInterceptor();
        claim.release();
      },
    };
  };
}
