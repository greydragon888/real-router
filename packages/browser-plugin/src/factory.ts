import { getPluginApi } from "@real-router/core";

import { createSafeBrowser } from "./browser";
import { defaultOptions, LOGGER_CONTEXT, source } from "./constants";
import { BrowserPlugin } from "./plugin";
import { createRegExpCache } from "./url-utils";
import { validateOptions } from "./validation";

import type {
  BrowserPluginOptions,
  Browser,
  SharedFactoryState,
} from "./types";
import type { PluginFactory, Router } from "@real-router/core";

/**
 * Browser plugin factory for real-router.
 * Integrates router with browser history API.
 *
 * @param opts - Plugin configuration options
 * @param browser - Browser API abstraction (for testing/SSR)
 * @returns Plugin factory function
 *
 * @example
 * ```ts
 * // Hash routing
 * router.usePlugin(browserPluginFactory({ useHash: true, hashPrefix: "!" }));
 *
 * // History routing with hash preservation
 * router.usePlugin(browserPluginFactory({ useHash: false, preserveHash: true }));
 * ```
 */
export function browserPluginFactory(
  opts?: Partial<BrowserPluginOptions>,
  browser: Browser = createSafeBrowser(),
): PluginFactory {
  const hasInvalidTypes = validateOptions(opts, defaultOptions);

  let options = { ...defaultOptions, ...opts } as BrowserPluginOptions;

  if (hasInvalidTypes) {
    console.warn(
      `[${LOGGER_CONTEXT}] Using default options due to invalid types`,
    );
    options = { ...defaultOptions } as BrowserPluginOptions;
  }

  if (options.useHash === true) {
    delete (options as unknown as Record<string, unknown>).preserveHash;
  } else {
    delete (options as unknown as Record<string, unknown>).hashPrefix;
  }

  if (options.base && typeof options.base === "string") {
    if (!options.base.startsWith("/")) {
      options.base = `/${options.base}`;
    }

    if (options.base.endsWith("/")) {
      options.base = options.base.slice(0, -1);
    }
  }

  const regExpCache = createRegExpCache();

  const forceDeactivate = options.forceDeactivate;
  /* v8 ignore next 4 -- @preserve both branches tested, coverage tool limitation */
  const transitionOptions =
    forceDeactivate === undefined
      ? { source, replace: true as const }
      : { forceDeactivate, source, replace: true as const };

  const shared: SharedFactoryState = { removePopStateListener: undefined };

  return function browserPlugin(routerBase) {
    const plugin = new BrowserPlugin(
      routerBase as Router,
      getPluginApi(routerBase),
      options,
      browser,
      regExpCache,
      transitionOptions,
      shared,
    );

    return plugin.getPlugin();
  };
}
