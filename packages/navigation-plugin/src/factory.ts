import { getPluginApi } from "@real-router/core/api";

import { isBrowserEnvironment, normalizeBase } from "./browser-env";
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

/**
 * The routers this plugin is registered on (#2974). A second registration on
 * one of them throws before it registers anything, and teardown takes the
 * router out. `tests/functional/reregistration-2974.test.ts` holds the cells.
 */
const REGISTERED = new WeakSet<object>();

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
    if (REGISTERED.has(routerBase)) {
      throw new Error(
        `[navigation-plugin] is already registered on this router — a clone already carries the plugins of its base router`,
      );
    }

    const api = getPluginApi(routerBase);

    const plugin = new NavigationPlugin(
      routerBase as Router,
      api,
      options,
      resolvedBrowser,
      transitionOptions,
      shared,
    ).getPlugin();

    REGISTERED.add(routerBase);

    return {
      ...plugin,
      teardown: () => {
        REGISTERED.delete(routerBase);

        return plugin.teardown?.();
      },
    };
  };
}

function createBrowser(base: string): NavigationBrowser {
  if ("navigation" in globalThis) {
    return createNavigationBrowser(base);
  }

  return createNavigationFallbackBrowser("navigation-plugin");
}
