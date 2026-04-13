import { getPluginApi } from "@real-router/core/api";

import { defaultOptions } from "./constants";
import { PreloadPlugin } from "./plugin";

import type { PreloadPluginOptions } from "./types";
import type { PluginFactory, Router } from "@real-router/core";

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
    if (typeof document === "undefined") {
      return {};
    }

    const plugin = new PreloadPlugin(
      routerBase as Router,
      getPluginApi(routerBase),
      options,
      getDependency,
    );

    return plugin.getPlugin();
  };
}
