// packages/logger-plugin/src/constants.ts

import type { LoggerPluginConfig } from "./types";

export const LOGGER_CONTEXT = "logger-plugin";

export const ERROR_PREFIX = `[@real-router/${LOGGER_CONTEXT}]`;

export const DEFAULT_CONFIG: Required<LoggerPluginConfig> = {
  level: "all",
  usePerformanceMarks: false,
  showParamsDiff: true,
  showTiming: true,
  context: LOGGER_CONTEXT,
};
