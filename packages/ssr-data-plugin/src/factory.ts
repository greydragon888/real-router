import { ERROR_PREFIX } from "./constants";
import { createSsrLoaderPlugin } from "./shared-ssr";
import { validateLoaders } from "./validation";

import type { DataLoaderFactoryMap } from "./types";
import type { DefaultDependencies, PluginFactory } from "@real-router/types";

export function ssrDataPluginFactory<
  Dependencies extends DefaultDependencies = DefaultDependencies,
>(loaders: DataLoaderFactoryMap<Dependencies>): PluginFactory<Dependencies> {
  validateLoaders(loaders);

  return createSsrLoaderPlugin<unknown, Dependencies>(loaders, {
    namespace: "data",
    errorPrefix: ERROR_PREFIX,
  });
}
