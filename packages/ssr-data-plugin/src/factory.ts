import { ERROR_PREFIX } from "./constants";
import { createLoadersValidator, createSsrLoaderPlugin } from "./shared-ssr";

import type { DataLoaderFactoryMap } from "./types";
import type { DefaultDependencies, PluginFactory } from "@real-router/types";

// Inlined from the deleted validation.ts — single 4-line consumer was here,
// no other importer in src/ or tests/, so the indirection was pure ceremony.
// Symmetric with rsc-server-plugin's same merge (commit 7141f232).
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
