import { getPluginApi } from "@real-router/core/api";

import type {
  SsrLoaderFactoryMap,
  SsrLoaderFn,
  SsrLoaderPluginConfig,
} from "./types.js";
import type {
  DefaultDependencies,
  Plugin,
  PluginFactory,
} from "@real-router/types";

export function createSsrLoaderPlugin<
  T,
  Dependencies extends DefaultDependencies = DefaultDependencies,
>(
  loaders: SsrLoaderFactoryMap<T, Dependencies>,
  config: SsrLoaderPluginConfig,
): PluginFactory<Dependencies> {
  return (router, getDependency): Plugin => {
    const api = getPluginApi(router);
    const claim = api.claimContextNamespace(config.namespace);

    const compiledLoaders = new Map<string, SsrLoaderFn<T>>();

    try {
      for (const [name, factory] of Object.entries(loaders)) {
        const loader = factory(router, getDependency);

        if (typeof loader !== "function") {
          throw new TypeError(
            `${config.errorPrefix} factory for route "${name}" must return a function`,
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
