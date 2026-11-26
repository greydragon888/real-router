import { getPluginApi } from "@real-router/core/api";

import { defaultOptions } from "./constants";
import { PreloadPlugin } from "./plugin";

import type { PreloadPluginOptions } from "./types";
import type { PluginFactory, Router } from "@real-router/core";

/**
 * The routers this plugin is registered on (#2974). A second registration on
 * one of them throws before it registers anything, and teardown takes the
 * router out. `tests/functional/reregistration-2974.test.ts` holds the cells.
 */
const REGISTERED = new WeakSet<object>();

export function preloadPluginFactory(
  opts?: Partial<PreloadPluginOptions>,
): PluginFactory {
  const options: Required<PreloadPluginOptions> = {
    ...defaultOptions,
    ...opts,
  };

  if (!Number.isFinite(options.delay) || options.delay < 0) {
    options.delay = 0;
  }

  return function preloadPlugin(routerBase, getDependency) {
    if (REGISTERED.has(routerBase)) {
      throw new Error(
        `[@real-router/preload-plugin] is already registered on this router — a clone already carries the plugins of its base router`,
      );
    }

    if (typeof document === "undefined") {
      REGISTERED.add(routerBase);

      return {
        teardown: () => {
          REGISTERED.delete(routerBase);
        },
      };
    }

    const plugin = new PreloadPlugin(
      routerBase as Router,
      getPluginApi(routerBase),
      options,
      getDependency,
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
