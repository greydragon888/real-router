// packages/real-router-plugin-logger/modules/constants.ts

import type { LoggerPluginConfig } from "./types";

export const DEFAULT_CONFIG: Required<LoggerPluginConfig> = {
  level: "all",
  showParamsDiff: true,
  showTiming: true,
  context: "real-router-plugin-logger",
};
