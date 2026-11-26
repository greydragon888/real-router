import { getPluginApi } from "@real-router/core/api";

import { MemoryPlugin } from "./plugin";

import type { MemoryPluginOptions } from "./types";
import type { PluginFactory, Plugin, Router } from "@real-router/core";

/** Captured like the deciding seven, but this one BUILDS the guarantee (#2073). */
const freeze = Object.freeze;

/**
 * The routers this plugin is registered on (#2974). A second registration on
 * one of them throws before it registers anything, and teardown takes the
 * router out. `tests/functional/reregistration-2974.test.ts` holds the cells.
 */
const REGISTERED = new WeakSet<object>();

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

  const frozenOptions: MemoryPluginOptions = freeze({ ...options });

  return (router): Plugin => {
    if (REGISTERED.has(router)) {
      throw new Error(
        `[memory-plugin] is already registered on this router — a clone already carries the plugins of its base router`,
      );
    }

    const api = getPluginApi(router);
    const plugin = new MemoryPlugin(
      router as Router,
      api,
      frozenOptions,
    ).getPlugin();

    REGISTERED.add(router);

    return {
      ...plugin,
      teardown: () => {
        REGISTERED.delete(router);

        return plugin.teardown?.();
      },
    };
  };
}
