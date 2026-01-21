import { fc } from "@fast-check/vitest";

import { LEVEL_CONFIGS, LOG_LEVELS as LOG_LEVELS_MAP } from "logger";

import type { LogCallback, LogLevel, LogLevelConfig } from "logger";

// ============================================================================
// Constants
// ============================================================================

/**
 * All possible log levels (for messages)
 * Extracted from LOG_LEVELS constant mapping
 */
export const LOG_LEVELS = Object.keys(LOG_LEVELS_MAP) as LogLevel[];

/**
 * All possible configuration levels (for filtering)
 * Extracted from LEVEL_CONFIGS constant mapping
 */
export const LOG_LEVEL_CONFIGS = Object.keys(LEVEL_CONFIGS) as LogLevelConfig[];

// ============================================================================
// Generators (Arbitraries)
// ============================================================================

/**
 * Log level generator (log, warn, error)
 */
export const logLevelArbitrary = fc.constantFrom(...LOG_LEVELS);

/**
 * Configuration level generator (all, warn-error, error-only, none)
 */
export const logLevelConfigArbitrary = fc.constantFrom(...LOG_LEVEL_CONFIGS);

/**
 * Context string generator
 * Covers different patterns: simple, with dots, with colons, empty
 */
export const contextArbitrary = fc.oneof(
  fc.constant(""),
  fc.constant("Router"),
  fc.constant("Router.Core"),
  fc.constant("router.usePlugin"),
  fc.constant("Router:Navigation"),
  fc.constant("router/lifecycle"),
  fc.constant("router_helpers"),
  fc.string({ minLength: 1, maxLength: 50 }),
);

/**
 * Log message generator
 */
export const messageArbitrary = fc.string({ minLength: 0, maxLength: 200 });

/**
 * Additional logging arguments generator
 * Includes primitives, objects, null, undefined
 */
export const logArgsArbitrary = fc.array(
  fc.oneof(
    fc.string(),
    fc.integer(),
    fc.boolean(),
    fc.constant(null),
    fc.constant(undefined),
    fc.record({
      id: fc.integer(),
      name: fc.string(),
    }),
    fc.array(fc.integer()),
  ),
  { maxLength: 5 },
);

/**
 * Callback function generator
 * Creates a mock function that can be verified
 */
export const callbackArbitrary = fc.constant(() => {
  const callback: LogCallback = vi.fn();

  return callback;
});

/**
 * Throwing callback function generator
 */
export const throwingCallbackArbitrary = fc.constant(() => {
  const callback: LogCallback = vi.fn().mockImplementation(() => {
    throw new Error("Callback error");
  });

  return callback;
});

// ============================================================================
// Helper functions
// ============================================================================

/**
 * Determines if a message should be filtered for console output
 * based on configuration level
 *
 * Uses LOG_LEVELS and LEVEL_CONFIGS constants from logger module
 * to ensure filtering logic consistency
 *
 * @param messageLevel - Message level (log, warn, error)
 * @param configLevel - Configuration level (all, warn-error, error-only, none)
 * @returns true if message should be filtered (not output)
 */
export function shouldFilterMessage(
  messageLevel: LogLevel,
  configLevel: LogLevelConfig,
): boolean {
  // Get numeric values from module constants
  const messageLevelValue = LOG_LEVELS_MAP[messageLevel];
  const configThreshold = LEVEL_CONFIGS[configLevel];

  // Message is filtered if its level is below threshold
  return messageLevelValue < configThreshold;
}

/**
 * Determines if callback should be invoked
 *
 * @param messageLevel - Message level
 * @param configLevel - Configuration level
 * @param callbackIgnoresLevel - Whether callback ignores level
 * @returns true if callback should be invoked
 */
export function shouldInvokeCallback(
  messageLevel: LogLevel,
  configLevel: LogLevelConfig,
  callbackIgnoresLevel: boolean,
): boolean {
  // If callbackIgnoresLevel = true, always invoke (except level=none without flag)
  if (callbackIgnoresLevel) {
    return true;
  }

  // If level=none and callbackIgnoresLevel=false, don't invoke
  if (configLevel === "none") {
    return false;
  }

  // Otherwise apply same filtering logic as for console
  return !shouldFilterMessage(messageLevel, configLevel);
}

/**
 * Formats message with context
 *
 * @param context - Message context
 * @param message - Message itself
 * @returns Formatted message
 */
export function formatMessage(context: string, message: string): string {
  return context ? `[${context}] ${message}` : message;
}
