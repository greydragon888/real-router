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

  return function preloadPlugin(routerBase) {
    if (typeof document === "undefined") {
      return {};
    }

    const plugin = new PreloadPlugin(
      routerBase as Router,
      getPluginApi(routerBase),
      options,
    );

    return plugin.getPlugin();
  };
}
