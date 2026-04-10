import { getPluginApi } from "@real-router/core/api";

import { isBrowserEnvironment, normalizeBase } from "./browser-env/index.js";
import { defaultOptions, source } from "./constants";
import { createNavigationBrowser } from "./navigation-browser";
import { NavigationPlugin } from "./plugin";
import { createNavigationFallbackBrowser } from "./ssr-fallback";
import { validateOptions } from "./validation";

import type {
  NavigationPluginOptions,
  NavigationBrowser,
  NavigationSharedState,
} from "./types";
import type { PluginFactory, Router } from "@real-router/core";

export function navigationPluginFactory(
  opts?: Partial<NavigationPluginOptions>,
  browser?: NavigationBrowser,
): PluginFactory {
  if (!browser && isBrowserEnvironment() && !("navigation" in globalThis)) {
    throw new Error(
      "[navigation-plugin] Navigation API is not supported. Use @real-router/browser-plugin instead.",
    );
  }

  validateOptions(opts);

  const options: Required<NavigationPluginOptions> = {
    ...defaultOptions,
    ...opts,
  };

  options.base = normalizeBase(options.base);

  const resolvedBrowser = browser ?? createBrowser(options.base);

  const forceDeactivate = options.forceDeactivate;
  const transitionOptions = { forceDeactivate, source, replace: true as const };
  const shared: NavigationSharedState = { removeNavigateListener: undefined };

  return (routerBase) => {
    const api = getPluginApi(routerBase);

    const plugin = new NavigationPlugin(
      routerBase as Router,
      api,
      options,
      resolvedBrowser,
      transitionOptions,
      shared,
    );

    return plugin.getPlugin();
  };
}

function createBrowser(base: string): NavigationBrowser {
  if ("navigation" in globalThis) {
    return createNavigationBrowser(base);
  }

  return createNavigationFallbackBrowser("navigation-plugin");
}
