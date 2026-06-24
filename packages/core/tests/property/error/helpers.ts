import { fc } from "@fast-check/vitest";

import { errorCodes } from "@real-router/core";

// ============================================================================
// Constants
// ============================================================================

/**
 * All standard error codes
 * Extracted from errorCodes constant mapping
 */
export const ERROR_CODE_KEYS = Object.keys(errorCodes);

export const ERROR_CODE_VALUES = Object.values(errorCodes);

// ============================================================================
// Generators (Arbitraries)
// ============================================================================

/**
 * Error code generator
 * Combines standard codes and arbitrary strings
 */
export const errorCodeArbitrary = fc.oneof(
  fc.constantFrom(...(ERROR_CODE_VALUES as [string, ...string[]])), // Standard codes
  fc.string({ minLength: 1, maxLength: 50 }), // Arbitrary codes
  fc.constant(""), // Empty string
);

/**
 * Error message generator
 */
export const messageArbitrary = fc.oneof(
  fc.constant(undefined), // Not specified (code will be used)
  fc.string({ minLength: 0, maxLength: 200 }), // Arbitrary message
  fc.constantFrom(...(ERROR_CODE_VALUES as [string, ...string[]])), // Standard code as message
);

/**
 * Segment generator
 */
export const segmentArbitrary = fc.oneof(
  fc.constant(undefined),
  fc.string({ minLength: 1, maxLength: 50 }),
  fc.constant(""),
);

/**
 * Path generator
 */
export const pathArbitrary = fc.oneof(
  fc.constant(undefined),
  fc.constant("/"),
  fc.constant("/users"),
  fc.constant("/users/123"),
  fc.string({ minLength: 1, maxLength: 100 }),
  fc.constant(""),
);

/**
 * Arbitrary additional fields generator
 * Excludes reserved method names and dangerous keys
 */
export const customFieldsArbitrary = fc.dictionary(
  fc.string({ minLength: 1, maxLength: 20 }).filter(
    (key) =>
      ![
        "setCode",
        "setErrorInstance",
        "setAdditionalFields",
        "hasField",
        "getField",
        "toJSON",
      ].includes(key) &&
      ![
        "code",
        "segment",
        "path",
        "message",
        "stack",
        // `name` is Error metadata: the constructor sets it to "RouterError"
        // and toJSON excludes it (like `stack`) — not a round-trippable field.
        "name",
      ].includes(key) &&
      !["__proto__", "constructor", "prototype"].includes(key),
  ),
  fc.anything(),
  { maxKeys: 5 },
);

/**
 * RouterError constructor options generator
 */
export const constructorOptionsArbitrary = fc.record(
  {
    message: messageArbitrary,
    segment: segmentArbitrary,
    path: pathArbitrary,
  },
  { requiredKeys: [] },
);

/**
 * Error instance generator for setErrorInstance
 */
export const errorInstanceArbitrary = fc.record({
  message: fc.string(),
  stack: fc.option(fc.string()),
  cause: fc.option(fc.anything()),
});

// ============================================================================
// Helper functions
// ============================================================================

/**
 * Checks if a value is a standard error code
 */
export function isStandardErrorCode(value: string): boolean {
  return ERROR_CODE_VALUES.includes(value);
}

/**
 * Creates Error instance from arbitrary data
 */
export function createErrorInstance(data: {
  message: string;
  stack?: string | null;
  cause?: unknown;
}): Error {
  const err = new Error(data.message);

  // Always set stack if provided (including null -> "")
  if (data.stack !== undefined) {
    err.stack = data.stack ?? "";
  }
  if (data.cause !== undefined) {
    err.cause = data.cause;
  }

  return err;
}
