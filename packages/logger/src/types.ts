// packages/logger/modules/types.ts

/**
 * Log message severity level.
 *
 * Ordered by severity (lowest to highest):
 * - `log`: Informational messages, debugging, trace
 * - `warn`: Warnings, deprecations, non-critical issues
 * - `error`: Critical errors, exceptions, failures
 *
 * @example
 * ```ts
 * const level: LogLevel = 'warn';
 * logger[level]('Router', 'Message'); // Calls logger.warn()
 * ```
 */
export type LogLevel = "log" | "warn" | "error";

/**
 * Logger threshold configuration level.
 *
 * Determines which messages are displayed based on severity:
 * - `all`: Show all messages (log, warn, error)
 * - `warn-error`: Show only warnings and errors (filter out log)
 * - `error-only`: Show only errors (filter out log and warn)
 * - `none`: Show no messages (completely silent, unless callback ignores level)
 *
 * Note: Higher threshold = fewer messages shown.
 *
 * @example
 * ```ts
 * // Production: only show errors
 * logger.configure({ level: 'error-only' });
 *
 * // Development: show everything
 * logger.configure({ level: 'all' });
 * ```
 */
export type LogLevelConfig = "all" | "warn-error" | "error-only" | "none";

/**
 * Callback function type for custom log processing.
 *
 * Receives all log messages that pass the configured level threshold
 * (unless `callbackIgnoresLevel` is true, then receives all messages).
 *
 * Common use cases:
 * - Send logs to external analytics service
 * - Store logs in memory for debugging
 * - Filter and forward to remote logging system
 * - Display logs in custom UI component
 *
 * @param level - Severity level of this message
 * @param context - Context/module identifier (e.g., 'Router', 'Plugin')
 * @param message - Main log message text
 * @param args - Additional arguments (objects, errors, etc.)
 *
 * @example
 * ```ts
 * const analyticsCallback: LogCallback = (level, context, message, ...args) => {
 *   sendToAnalytics({
 *     severity: level,
 *     module: context,
 *     text: message,
 *     metadata: args
 *   });
 * };
 *
 * logger.configure({ callback: analyticsCallback });
 * ```
 */
export type LogCallback = (
  level: LogLevel,
  context: string,
  message: string,
  ...args: unknown[]
) => void;

/**
 * Logger configuration interface.
 *
 * Controls both console output and callback behavior.
 *
 * @example
 * ```ts
 * // Minimal configuration
 * const config: LoggerConfig = {
 *   level: 'warn-error'
 * };
 *
 * // Full configuration with callback
 * const config: LoggerConfig = {
 *   level: 'error-only',
 *   callback: (level, context, message) => {
 *     // Send all errors to monitoring service
 *   },
 *   callbackIgnoresLevel: false // Callback respects 'error-only' level
 * };
 * ```
 */
export interface LoggerConfig {
  /**
   * Minimum severity level to display in console.
   *
   * Messages below this threshold are filtered out from console output.
   * Does not affect callback unless `callbackIgnoresLevel` is false.
   *
   * @default 'all'
   */
  level: LogLevelConfig;

  /**
   * Optional callback function for custom log processing.
   *
   * Called for each log message (subject to `callbackIgnoresLevel` setting).
   * Can be undefined to disable callback processing.
   *
   * @default undefined
   */
  callback?: LogCallback | undefined;

  /**
   * Whether callback should receive ALL messages regardless of level threshold.
   *
   * - `false` (default): Callback only receives messages that pass level threshold
   *   (same filtering as console output)
   * - `true`: Callback receives ALL messages, even those filtered from console
   *   (useful for analytics where you want to track everything)
   *
   * @default false
   *
   * @example
   * ```ts
   * // Scenario: Show only errors in console, but track ALL logs in analytics
   * logger.configure({
   *   level: 'error-only',           // Console: only errors
   *   callback: sendToAnalytics,
   *   callbackIgnoresLevel: true     // Callback: receives log/warn/error
   * });
   * ```
   */
  callbackIgnoresLevel?: boolean;
}
