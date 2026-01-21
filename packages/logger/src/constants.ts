// packages/logger/modules/constants.ts

import type { LogLevel, LogLevelConfig } from "./types";

/**
 * Numeric mapping for log message severity levels.
 *
 * Maps each severity level to a numeric value for threshold comparison.
 * Lower values = lower severity, higher values = higher severity.
 *
 * Used internally to determine if a message should be filtered based on
 * the configured threshold level.
 *
 * Mapping:
 * - `log`: 0 (lowest severity - informational)
 * - `warn`: 1 (medium severity - warnings)
 * - `error`: 2 (highest severity - critical errors)
 *
 * @example
 * ```ts
 * const messageLevel = LOG_LEVELS['warn'];  // 1
 * const threshold = 2;  // error-only
 * const shouldFilter = messageLevel < threshold;  // true (warn is filtered)
 * ```
 *
 * @internal This is used for internal filtering logic
 */
export const LOG_LEVELS: Record<LogLevel, number> = {
  log: 0,
  warn: 1,
  error: 2,
};

/**
 * Numeric thresholds for logger configuration levels.
 *
 * Maps each configuration level to a minimum threshold value.
 * Messages with a severity level below this threshold are filtered out.
 *
 * Threshold logic:
 * - A message is shown if: `LOG_LEVELS[messageLevel] >= LEVEL_CONFIGS[configLevel]`
 * - Higher threshold value = stricter filtering = fewer messages shown
 *
 * Mapping:
 * - `all`: 0 (no filtering - show everything)
 *   - Shows: log (0), warn (1), error (2) ✓
 * - `warn-error`: 1 (filter log messages)
 *   - Shows: warn (1), error (2) ✓
 *   - Filters: log (0) ✗
 * - `error-only`: 2 (filter log and warn messages)
 *   - Shows: error (2) ✓
 *   - Filters: log (0), warn (1) ✗
 * - `none`: 3 (filter all messages - complete silence)
 *   - Filters: log (0), warn (1), error (2) ✗
 *
 * @example
 * ```ts
 * // Configuration: warn-error
 * const threshold = LEVEL_CONFIGS['warn-error'];  // 1
 *
 * // Check if 'log' message should be shown
 * LOG_LEVELS['log'] >= threshold  // 0 >= 1 = false (filtered)
 *
 * // Check if 'warn' message should be shown
 * LOG_LEVELS['warn'] >= threshold  // 1 >= 1 = true (shown)
 *
 * // Check if 'error' message should be shown
 * LOG_LEVELS['error'] >= threshold  // 2 >= 1 = true (shown)
 * ```
 *
 * @internal This is used for internal threshold comparison
 */
export const LEVEL_CONFIGS: Record<LogLevelConfig, number> = {
  all: 0,
  "warn-error": 1,
  "error-only": 2,
  none: 3,
};
