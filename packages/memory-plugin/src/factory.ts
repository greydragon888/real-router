import { getPluginApi } from "@real-router/core/api";

import { MemoryPlugin } from "./plugin";

import type { MemoryPluginOptions } from "./types";
import type { PluginFactory, Plugin, Router } from "@real-router/core";

export function memoryPluginFactory(
  options: MemoryPluginOptions = {},
): PluginFactory {
  if (
    options.maxHistoryLength !== undefined &&
    (typeof options.maxHistoryLength !== "number" ||
      options.maxHistoryLength < 0)
  ) {
    throw new TypeError(
      `[memory-plugin] Invalid maxHistoryLength: expected non-negative number, got ${String(options.maxHistoryLength)}.`,
    );
  }

  const frozenOptions: MemoryPluginOptions = Object.freeze({ ...options });

  return (router): Plugin => {
    const api = getPluginApi(router);
    const plugin = new MemoryPlugin(router as Router, api, frozenOptions);

    return plugin.getPlugin();
  };
}
