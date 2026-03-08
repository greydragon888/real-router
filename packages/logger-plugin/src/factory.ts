// packages/logger-plugin/src/factory.ts

import { DEFAULT_CONFIG } from "./constants";
import { LoggerPlugin } from "./plugin";
import { validateOptions } from "./validation";

import type { LoggerPluginConfig } from "./types";
import type { PluginFactory } from "@real-router/core";

export function loggerPluginFactory(
  options?: Partial<LoggerPluginConfig>,
): PluginFactory {
  validateOptions(options);

  const config: Required<LoggerPluginConfig> = {
    ...DEFAULT_CONFIG,
    ...options,
  };

  return () => new LoggerPlugin(config).getPlugin();
}
