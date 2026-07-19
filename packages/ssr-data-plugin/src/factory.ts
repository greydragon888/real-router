import { ERROR_PREFIX } from "./constants";
import { createLoadersValidator, createSsrLoaderPlugin } from "./shared-ssr";

import type { DataLoaderFactoryMap } from "./types";
import type { DefaultDependencies, PluginFactory } from "@real-router/core";

// Inlined binding — symmetric with rsc-server-plugin's same merge.
const validateLoaders = createLoadersValidator(ERROR_PREFIX);

export function ssrDataPluginFactory<
  Dependencies extends DefaultDependencies = DefaultDependencies,
>(loaders: DataLoaderFactoryMap<Dependencies>): PluginFactory<Dependencies> {
  validateLoaders(loaders);

  return createSsrLoaderPlugin<unknown, Dependencies>(loaders, {
    namespace: "data",
    modeNamespace: "ssrDataMode",
    deferredNamespace: "ssrDataDeferred",
    deferredKeysNamespace: "ssrDataDeferredKeys",
    errorPrefix: ERROR_PREFIX,
  });
}
