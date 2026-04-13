import { getPluginApi } from "@real-router/core/api";

import { ERROR_PREFIX } from "./constants";
import { validateLoaders } from "./validation";

import type { DataLoaderFn, DataLoaderFactoryMap } from "./types";
import type { PluginFactory, Plugin } from "@real-router/core";

export function ssrDataPluginFactory(
  loaders: DataLoaderFactoryMap,
): PluginFactory {
  validateLoaders(loaders);

  return (router, getDependency): Plugin => {
    const api = getPluginApi(router);
    const claim = api.claimContextNamespace("data");

    const compiledLoaders = new Map<string, DataLoaderFn>();

    try {
      for (const [name, factory] of Object.entries(loaders)) {
        const loader = factory(router, getDependency);

        if (typeof loader !== "function") {
          throw new TypeError(
            `${ERROR_PREFIX} factory for route "${name}" must return a function`,
          );
        }

        compiledLoaders.set(name, loader);
      }
    } catch (error) {
      claim.release();

      throw error;
    }

    const removeStartInterceptor = api.addInterceptor(
      "start",
      async (next, path) => {
        const state = await next(path);
        const loader = compiledLoaders.get(state.name);

        if (loader) {
          claim.write(state, await loader(state.params));
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
