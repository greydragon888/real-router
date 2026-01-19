// packages/real-router-plugin-logger/modules/types.ts

/**
 * Represents differences between two parameter objects.
 */
export interface ParamsDiff {
  changed: Record<string, { from: unknown; to: unknown }>;
  added: Record<string, unknown>;
  removed: Record<string, unknown>;
}

/**
 * Logging level for router events.
 * Controls which events are logged to the console.
 */
export type LogLevel = "all" | "transitions" | "errors" | "none";

/**
 * Configuration options for the logger plugin.
 */
export interface LoggerPluginConfig {
  /**
   * Logging level - controls what router events to log.
   *
   * - 'all': Log all router events (default)
   * - 'transitions': Log only transition-related events
   * - 'errors': Log only transition errors
   * - 'none': Disable all logging
   *
   * @default 'all'
   */
  level?: LogLevel;

  /**
   * Show execution time in milliseconds for transitions.
   * Helps identify slow route changes.
   *
   * @default true
   */
  showTiming?: boolean;

  /**
   * Show diff of changed route parameters between transitions.
   * Only applies when navigating within the same route.
   * Helps identify which parameters changed during navigation.
   *
   * @default false
   */
  showParamsDiff?: boolean;

  /**
   * Custom context name for logger.
   * Useful when running multiple routers.
   *
   * @default 'real-router-plugin-logger'
   */
  context?: string;
}
