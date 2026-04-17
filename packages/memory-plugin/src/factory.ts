import { getPluginApi } from "@real-router/core/api";

import { MemoryPlugin } from "./plugin";

import type { MemoryPluginOptions } from "./types";
import type { PluginFactory, Plugin, Router } from "@real-router/core";

export function memoryPluginFactory(
  options: MemoryPluginOptions = {},
): PluginFactory {
  if (options.maxHistoryLength !== undefined) {
    const length = options.maxHistoryLength;

    if (
      typeof length !== "number" ||
      !Number.isFinite(length) ||
      !Number.isInteger(length) ||
      length < 0
    ) {
      throw new TypeError(
        `[memory-plugin] Invalid maxHistoryLength: expected non-negative integer, got ${String(length)}.`,
      );
    }
  }

  const frozenOptions: MemoryPluginOptions = Object.freeze({ ...options });

  return (router): Plugin => {
    const api = getPluginApi(router);
    const plugin = new MemoryPlugin(router as Router, api, frozenOptions);

    return plugin.getPlugin();
  };
}
