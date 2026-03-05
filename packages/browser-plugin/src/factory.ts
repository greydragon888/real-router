import { getPluginApi } from "@real-router/core";

import { createSafeBrowser } from "./browser";
import { defaultOptions, source } from "./constants";
import { BrowserPlugin } from "./plugin";
import { validateOptions } from "./validation";

import type {
  BrowserPluginOptions,
  Browser,
  SharedFactoryState,
} from "./types";
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

  if (options.base) {
    if (!options.base.startsWith("/")) {
      options.base = `/${options.base}`;
    }

    if (options.base.endsWith("/")) {
      options.base = options.base.slice(0, -1);
    }
  }

  const resolvedBrowser = browser ?? createSafeBrowser(options.base);

  const forceDeactivate = options.forceDeactivate;
  const transitionOptions = { forceDeactivate, source, replace: true as const };

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
