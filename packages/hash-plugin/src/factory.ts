// packages/hash-plugin/src/factory.ts

import { getPluginApi } from "@real-router/core";

import { createSafeBrowser } from "./browser";
import { defaultOptions, source } from "./constants";
import { createRegExpCache } from "./hash-utils";
import { HashPlugin } from "./plugin";
import { validateOptions } from "./validation";

import type { HashPluginOptions, Browser, SharedFactoryState } from "./types";
import type { PluginFactory, Router } from "@real-router/core";

/**
 * Hash-based routing plugin factory for real-router.
 * Integrates router with browser hash for navigation.
 *
 * @param opts - Plugin configuration options
 * @param browser - Browser API abstraction (for testing/SSR)
 * @returns Plugin factory function
 */
export function hashPluginFactory(
  opts?: Partial<HashPluginOptions>,
  browser?: Browser,
): PluginFactory {
  validateOptions(opts);

  const options: Required<HashPluginOptions> = { ...defaultOptions, ...opts };

  if (options.base) {
    if (!options.base.startsWith("/")) {
      options.base = `/${options.base}`;
    }

    if (options.base.endsWith("/")) {
      options.base = options.base.slice(0, -1);
    }
  }

  const regExpCache = createRegExpCache();
  const resolvedBrowser =
    browser ?? createSafeBrowser(options.hashPrefix, regExpCache);

  const transitionOptions = {
    forceDeactivate: options.forceDeactivate,
    source,
    replace: true as const,
  };

  const shared: SharedFactoryState = { removePopStateListener: undefined };

  return function hashPlugin(routerBase) {
    const plugin = new HashPlugin(
      routerBase as Router,
      getPluginApi(routerBase),
      options,
      resolvedBrowser,
      regExpCache,
      transitionOptions,
      shared,
    );

    return plugin.getPlugin();
  };
}
