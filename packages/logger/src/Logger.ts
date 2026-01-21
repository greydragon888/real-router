// packages/logger/modules/Logger.ts

import { LOG_LEVELS, LEVEL_CONFIGS } from "./constants";

import type {
  LogLevel,
  LoggerConfig,
  LogLevelConfig,
  LogCallback,
} from "./types";

/**
 * Internal config type with required callbackIgnoresLevel
 * (always initialized to false)
 */
interface InternalLoggerConfig {
  level: LogLevelConfig;
  callback?: LogCallback | undefined;
  callbackIgnoresLevel: boolean;
}

/**
 * Logger class for centralized logging with configurable levels and callbacks.
 *
 * Features:
 * - Three log levels: log, warn, error
 * - Configurable threshold filtering (all, warn, error, none)
 * - Optional callback for custom log processing
 * - Callback can optionally ignore level threshold
 * - Context-based message formatting
 *
 * @example
 * ```ts
 * import { logger } from './Logger';
 *
 * // Configure logger
 * logger.configure({ level: 'warn' });
 *
 * // Use logger
 * logger.log('Router', 'Navigation started'); // Won't show (below threshold)
 * logger.warn('Router', 'Deprecated API used'); // Will show
 * ```
 */
class Logger {
  /** Internal configuration storage using private field */
  #config: InternalLoggerConfig = {
    level: "all",
    callbackIgnoresLevel: false,
  };

  /** Cached numeric threshold value for performance (avoids repeated lookups) */
  #currentThreshold = 0;

  /**
   * Configures the logger with new settings.
   *
   * @param config - Partial configuration to merge with existing config
   * @param config.level - Minimum log level to output ('all' | 'warn' | 'error' | 'none')
   * @param config.callback - Optional callback function to receive log messages
   * @param config.callbackIgnoresLevel - If true, callback receives all messages regardless of level
   *
   * @example
   * ```ts
   * // Set minimum level to warnings
   * logger.configure({ level: 'warn' });
   *
   * // Add custom callback that ignores level
   * logger.configure({
   *   callback: (level, context, message) => {
   *     sendToAnalytics({ level, context, message });
   *   },
   *   callbackIgnoresLevel: true
   * });
   * ```
   */
  configure(config: Partial<LoggerConfig>): void {
    if (config.level !== undefined) {
      // Validate that the provided level is a valid configuration level
      if (!(config.level in LEVEL_CONFIGS)) {
        throw new Error(
          `Invalid log level: "${config.level}". Valid levels are: ${Object.keys(LEVEL_CONFIGS).join(", ")}`,
        );
      }

      this.#config.level = config.level;
      this.#currentThreshold = LEVEL_CONFIGS[config.level];
    }
    if ("callback" in config) {
      this.#config.callback = config.callback;
    }
    if (config.callbackIgnoresLevel !== undefined) {
      this.#config.callbackIgnoresLevel = config.callbackIgnoresLevel;
    }
  }

  /**
   * Returns the current logger configuration.
   *
   * @returns Current configuration object with level, callback, and callbackIgnoresLevel
   *
   * @example
   * ```ts
   * const config = logger.getConfig();
   * console.log(config.level); // 'warn'
   * console.log(config.callbackIgnoresLevel); // false
   * ```
   */
  getConfig(): LoggerConfig {
    return {
      level: this.#config.level,
      callback: this.#config.callback,
      callbackIgnoresLevel: this.#config.callbackIgnoresLevel,
    };
  }

  /**
   * Logs an informational message at 'log' level.
   *
   * This is the lowest severity level. Messages are shown when level is 'all'.
   *
   * @param context - Context identifier (e.g., 'Router', 'Plugin')
   * @param message - Main log message
   * @param args - Additional arguments to log (objects, arrays, etc.)
   *
   * @example
   * ```ts
   * logger.log('Router', 'Navigation started', { from: '/home', to: '/about' });
   * // Output: [Router] Navigation started { from: '/home', to: '/about' }
   * ```
   */
  log(context: string, message: string, ...args: unknown[]): void {
    this.#writeLog("log", context, message, args);
  }

  /**
   * Logs a warning message at 'warn' level.
   *
   * Use for deprecation notices, non-critical issues, or potential problems.
   * Messages are shown when level is 'all' or 'warn'.
   *
   * @param context - Context identifier (e.g., 'Router', 'Plugin')
   * @param message - Warning message
   * @param args - Additional arguments to log
   *
   * @example
   * ```ts
   * logger.warn('Router', 'Using deprecated API', { method: 'oldNavigate' });
   * // Output: [Router] Using deprecated API { method: 'oldNavigate' }
   * ```
   */
  warn(context: string, message: string, ...args: unknown[]): void {
    this.#writeLog("warn", context, message, args);
  }

  /**
   * Logs an error message at 'error' level.
   *
   * Use for critical errors, exceptions, or failures that require attention.
   * Messages are shown when level is 'all', 'warn', or 'error'.
   *
   * @param context - Context identifier (e.g., 'Router', 'Plugin')
   * @param message - Error message
   * @param args - Additional arguments to log (often error objects)
   *
   * @example
   * ```ts
   * logger.error('Router', 'Navigation failed', new Error('Route not found'));
   * // Output: [Router] Navigation failed Error: Route not found
   * ```
   */
  error(context: string, message: string, ...args: unknown[]): void {
    this.#writeLog("error", context, message, args);
  }

  /**
   * Central logging method that coordinates console output and callback invocation.
   *
   * This method implements the core logging logic:
   * 1. Early exit optimization for 'none' level (unless callback ignores level)
   * 2. Level threshold comparison for console output filtering
   * 3. Delegates to #writeToConsole and #invokeCallback
   *
   * @param level - Log level ('log' | 'warn' | 'error')
   * @param context - Context identifier
   * @param message - Log message
   * @param args - Additional arguments
   *
   * @private
   */
  #writeLog(
    level: LogLevel,
    context: string,
    message: string,
    args: unknown[],
  ): void {
    // Early exit optimization: if level is 'none' and callback doesn't ignore level,
    // skip all processing (both console and callback)
    if (this.#config.level === "none" && !this.#config.callbackIgnoresLevel) {
      return;
    }

    // Convert message level to numeric value for threshold comparison
    // LOG_LEVELS: { log: 0, warn: 1, error: 2 }
    const messageLevelValue = LOG_LEVELS[level];

    // Determine if this message should skip console output
    // Example: if threshold is 'warn' (1), then 'log' messages (0) are skipped
    const shouldSkipConsole = messageLevelValue < this.#currentThreshold;

    // Console output (respects level threshold)
    if (!shouldSkipConsole) {
      this.#writeToConsole(level, context, message, args);
    }

    // Callback handling (may ignore level threshold based on config)
    this.#invokeCallback(level, context, message, shouldSkipConsole, args);
  }

  /**
   * Writes a formatted log message to the console.
   *
   * Features:
   * - Formats message with context: "[Context] message"
   * - Uses appropriate console method (log/warn/error)
   * - Safe: checks for console existence (for non-browser environments)
   *
   * @param level - Console method to use ('log' | 'warn' | 'error')
   * @param context - Context identifier (prepended to message if present)
   * @param message - Log message
   * @param args - Additional arguments to pass to console
   *
   * @private
   */
  #writeToConsole(
    level: LogLevel,
    context: string,
    message: string,
    args: unknown[],
  ): void {
    // Safety check: ensure console exists and has the required method
    // This is important for environments like Node.js tests or edge cases
    if (
      typeof console !== "undefined" &&
      typeof console[level] === "function"
    ) {
      // Format message with context bracket notation for visual clarity
      // Note: formatting is done inside the check to avoid unnecessary string allocation
      // when console is not available
      const formattedMessage = context ? `[${context}] ${message}` : message;

      console[level](formattedMessage, ...args);
    }
  }

  /**
   * Invokes the configured callback with log data, respecting level settings.
   *
   * Complex logic handling:
   * 1. Skip if no callback configured
   * 2. Skip if callback respects level AND message is below threshold
   * 3. Call callback with error handling (prevents callback errors from breaking logger)
   *
   * The callbackIgnoresLevel flag enables two modes:
   * - false (default): callback only receives messages that pass threshold (same as console)
   * - true: callback receives ALL messages regardless of threshold (useful for analytics)
   *
   * @param level - Log level
   * @param context - Context identifier
   * @param message - Log message
   * @param shouldSkipConsole - Whether console output was skipped (used for level logic)
   * @param args - Additional arguments
   *
   * @private
   */
  #invokeCallback(
    level: LogLevel,
    context: string,
    message: string,
    shouldSkipConsole: boolean,
    args: unknown[],
  ): void {
    // Early exit: no callback configured, or callback respects level and message is filtered
    if (
      !this.#config.callback ||
      (!this.#config.callbackIgnoresLevel && shouldSkipConsole)
    ) {
      return;
    }

    // Wrap callback invocation in try-catch to prevent user code errors
    // from breaking the logger or causing cascading failures
    try {
      this.#config.callback(level, context, message, ...args);
    } catch (error) {
      // Fallback error reporting if callback throws
      // Use console.error directly (don't call logger to avoid infinite loops)
      if (
        typeof console !== "undefined" &&
        typeof console.error === "function"
      ) {
        console.error("[Logger] Error in callback:", error);
      }
    }
  }
}

/**
 * Singleton logger instance for application-wide logging.
 *
 * This is the main export that should be used throughout the application.
 * Using a singleton ensures consistent configuration across all modules.
 *
 * @example
 * ```ts
 * import { logger } from '@core/logger';
 *
 * // Configure once at application startup
 * logger.configure({ level: 'warn' });
 *
 * // Use anywhere in your app
 * logger.log('MyModule', 'Operation completed');
 * logger.warn('MyModule', 'Deprecated feature used');
 * logger.error('MyModule', 'Operation failed', error);
 * ```
 */
export const logger = new Logger();
