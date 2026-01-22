// packages/logger-plugin/modules/types.ts

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
   * Use Performance API to create marks and measures.
   * Enables integration with browser DevTools Performance tab.
   *
   * Creates marks:
   * - `router:transition-start:{from}→{to}`
   * - `router:transition-end:{from}→{to}` (success)
   * - `router:transition-cancel:{from}→{to}` (cancelled)
   * - `router:transition-error:{from}→{to}` (error)
   *
   * Creates measures:
   * - `router:transition:{from}→{to}` (success)
   * - `router:transition-cancelled:{from}→{to}` (cancelled)
   * - `router:transition-failed:{from}→{to}` (error)
   *
   * @default false
   */
  usePerformanceMarks?: boolean;
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
   * @default 'logger-plugin'
   */
  context?: string;
}
