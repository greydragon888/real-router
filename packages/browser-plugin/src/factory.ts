import { getPluginApi } from "@real-router/core/api";

import {
  createSafeBrowser,
  normalizeBase,
  safelyEncodePath,
  extractPath,
} from "./browser-env";
import { defaultOptions, POPSTATE_SOURCE } from "./constants";
import { BrowserPlugin } from "./plugin";
import { validateOptions } from "./validation";

import type { Browser, SharedFactoryState } from "./browser-env";
import type { BrowserPluginOptions } from "./types";
import type { PluginFactory, Router } from "@real-router/core";

export function browserPluginFactory(
  opts?: Partial<BrowserPluginOptions>,
  browser?: Browser,
): PluginFactory {
  validateOptions(opts);

  const options: Required<BrowserPluginOptions> = {
    ...defaultOptions,
    ...opts,
  };

  options.base = normalizeBase(options.base);

  const resolvedBrowser =
    browser ??
    createSafeBrowser(
      () =>
        safelyEncodePath(
          extractPath(globalThis.location.pathname, options.base),
        ) + globalThis.location.search,
      "browser-plugin",
    );

  const transitionOptions = {
    forceDeactivate: options.forceDeactivate,
    source: POPSTATE_SOURCE,
    replace: true as const,
  };

  const shared: SharedFactoryState = { removePopStateListener: undefined };

  return function browserPlugin(routerBase) {
    const plugin = new BrowserPlugin(
      routerBase as Router,
      getPluginApi(routerBase),
      options,
      resolvedBrowser,
      transitionOptions,
      shared,
    );

    return plugin.getPlugin();
  };
}
