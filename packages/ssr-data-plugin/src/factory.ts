import { ERROR_PREFIX } from "./constants";
import { createLoadersValidator, createSsrLoaderPlugin } from "./shared-ssr";

import type { DataLoaderFactoryMap } from "./types";
import type { DefaultDependencies, PluginFactory } from "@real-router/core";

// Bound here: this file is the validator's one consumer.
const validateLoaders = createLoadersValidator(ERROR_PREFIX);

/**
 * The routers this plugin is registered on (#2974). `createSsrLoaderPlugin`
 * reads and writes it, and each creator keeps its own: under vitest the two
 * loader plugins share one copy of `shared/ssr`.
 * `tests/functional/reregistration-2974.test.ts` holds the cells.
 */
const REGISTERED = new WeakSet<object>();

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
    registered: REGISTERED,
  });
}
