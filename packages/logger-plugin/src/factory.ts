// packages/logger-plugin/src/factory.ts

import { DEFAULT_CONFIG, ERROR_PREFIX } from "./constants";
import { LoggerPlugin } from "./plugin";
import { validateOptions } from "./validation";

import type { LoggerPluginConfig } from "./types";
import type { Plugin, PluginFactory } from "@real-router/core";

/**
 * The routers this plugin is registered on (#2974). A second registration on
 * one of them throws before it registers anything, and teardown takes the
 * router out. `tests/functional/reregistration-2974.test.ts` holds the cells.
 */
const REGISTERED = new WeakSet<object>();

export function loggerPluginFactory(
  options?: Partial<LoggerPluginConfig>,
): PluginFactory {
  validateOptions(options);

  const config: Required<LoggerPluginConfig> = {
    ...DEFAULT_CONFIG,
    ...options,
  };

  return (router): Plugin => {
    if (REGISTERED.has(router)) {
      throw new Error(
        `${ERROR_PREFIX} is already registered on this router — a clone already carries the plugins of its base router`,
      );
    }

    const plugin = new LoggerPlugin(config).getPlugin();

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
