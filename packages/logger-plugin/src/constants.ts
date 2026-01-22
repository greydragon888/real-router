// packages/logger-plugin/modules/constants.ts

import type { LoggerPluginConfig } from "./types";

export const DEFAULT_CONFIG: Required<LoggerPluginConfig> = {
  level: "all",
  usePerformanceMarks: false,
  showParamsDiff: true,
  showTiming: true,
  context: "logger-plugin",
};
