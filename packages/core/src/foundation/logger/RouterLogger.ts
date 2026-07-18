// packages/core/src/foundation/logger/RouterLogger.ts

import { LOG_LEVELS, LEVEL_CONFIGS } from "./constants";

import type {
  LogLevel,
  LoggerConfig,
  LogLevelConfig,
  LogCallback,
} from "@real-router/types";

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
 * - Configurable threshold filtering (all, warn-error, error-only, none)
 * - Optional callback for custom log processing
 * - Callback can optionally ignore level threshold
 * - Context-based message formatting
 *
 * @example
 * ```ts
 * import { logger } from './Logger';
 *
 * // Configure logger
 * logger.configure({ level: 'warn-error' });
 *
 * // Use logger
 * logger.log('Router', 'Navigation started'); // Won't show (below threshold)
 * logger.warn('Router', 'Deprecated API used'); // Will show
 * ```
 */
export class RouterLogger {
  /** Internal configuration storage using private field */
  readonly #config: InternalLoggerConfig = {
    level: "all",
    callbackIgnoresLevel: false,
  };

  /** Cached numeric threshold value for performance (avoids repeated lookups) */
  #currentThreshold = 0;

  /**
   * Re-entrancy guard: true while a user callback is executing. Prevents a
   * callback that itself calls `logger.*` from recursing back through
   * `#invokeCallback` (which would otherwise spin ~5.9k deep until a swallowed
   * RangeError, see #791). Console output is unaffected.
   */
  #inCallback = false;

  /**
   * @param config - Optional initial configuration (level / callback /
   *   callbackIgnoresLevel), applied once at construction.
   *
   * Each router owns its own `RouterLogger` instance, built from
   * `options.logger` in the `Router` constructor. This replaces the former
   * process-global singleton whose `configure()` leaked across every router in
   * the process — the last `createRouter` won (#724).
   */
  constructor(config?: Partial<LoggerConfig>) {
    if (config) {
      this.configure(config);
    }
  }

  /**
   * Configures the logger with new settings.
   *
   * @param config - Partial configuration to merge with existing config
   * @param config.level - Minimum log level to output ('all' | 'warn-error' | 'error-only' | 'none')
   * @param config.callback - Optional callback function to receive log messages
   * @param config.callbackIgnoresLevel - If true, callback receives all messages regardless of level
   *
   * @example
   * ```ts
   * // Set minimum level to warnings
   * logger.configure({ level: 'warn-error' });
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
    // Read each field ONCE into a local — an unstable getter must not be re-read
    // between validation and storage: re-reading could pass validation with a
    // valid level and then store a later, unvalidated one, disabling the
    // threshold filter (a TOCTOU, #1162).
    const level = config.level;

    if (level !== undefined) {
      // Validate that the provided level is a valid configuration level
      if (!Object.hasOwn(LEVEL_CONFIGS, level)) {
        throw new Error(
          `Invalid log level: "${level}". Valid levels are: ${Object.keys(LEVEL_CONFIGS).join(", ")}`,
        );
      }

      this.#config.level = level;
      this.#currentThreshold = LEVEL_CONFIGS[level];
    }
    if (Object.hasOwn(config, "callback")) {
      this.#config.callback = config.callback;
    }

    const callbackIgnoresLevel = config.callbackIgnoresLevel;

    if (callbackIgnoresLevel !== undefined) {
      this.#config.callbackIgnoresLevel = callbackIgnoresLevel;
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
   * Messages are shown when level is 'all' or 'warn-error'.
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
   * Messages are shown when level is 'all', 'warn-error', or 'error-only'.
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
    // Stryker disable next-line BlockStatement: equivalent — emptying this early-exit block falls through, but at level "none" the downstream guards already yield no output: #writeToConsole skips (threshold 3 > every message level) and #invokeCallback returns (this branch runs only when callbackIgnoresLevel is false). Pure perf shortcut; the ConditionalExpression →true sibling on this line stays killed (not silenced here).
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

    // Re-entrancy guard: a callback calling logger.* re-enters here via
    // #writeLog → #invokeCallback. Skip the nested invocation so the pattern is
    // a safe no-op (console output already happened in #writeLog) instead of
    // recursing to a swallowed RangeError (#791).
    if (this.#inCallback) {
      return;
    }

    // Wrap callback invocation in try-catch to prevent user code errors
    // from breaking the logger or causing cascading failures
    this.#inCallback = true;
    try {
      // An async callback (`(...) => Promise<void>` is assignable to the
      // void-typed LogCallback) returns a Promise whose rejection would otherwise
      // leak as a Node `unhandledRejection` — process-fatal under
      // `--unhandled-rejections=strict` (Node 22+ default). Read the runtime
      // return and isolate it like core's subscribe (#944): duck-check the
      // thenable + `.catch` into the same console.error sink a sync throw uses
      // (#1161).
      // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression -- read the runtime Promise of a void-typed async callback (#1161)
      const result: unknown = this.#config.callback(
        level,
        context,
        message,
        ...args,
      );

      if (
        result !== null &&
        result !== undefined &&
        typeof (result as PromiseLike<unknown>).then === "function"
      ) {
        Promise.resolve(result as PromiseLike<unknown>).catch(
          (error: unknown) => {
            this.#reportError("[Logger] Error in async callback:", error);
          },
        );
      }
    } catch (error) {
      // Fallback error reporting if the callback throws synchronously
      this.#reportError("[Logger] Error in callback:", error);
    } finally {
      this.#inCallback = false;
    }
  }

  // Report a callback error via console.error directly — never call the logger
  // (would recurse). Shared by the sync-throw catch and the async-rejection
  // `.catch` (#1161). Console-safety guard mirrors #writeToConsole.
  #reportError(message: string, error: unknown): void {
    if (typeof console !== "undefined" && typeof console.error === "function") {
      console.error(message, error);
    }
  }
}
