import { fc } from "@fast-check/vitest";

import { errorCodes } from "@real-router/core";

import type { State } from "@real-router/types";

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
 * State generator for redirect
 */
export const stateArbitrary = fc.record({
  name: fc.string({ minLength: 1, maxLength: 50 }),
  path: fc.string({ minLength: 1, maxLength: 100 }),
  params: fc.dictionary(fc.string(), fc.anything()),
  meta: fc.option(fc.dictionary(fc.string(), fc.anything())),
}) as fc.Arbitrary<State>;

/**
 * Redirect generator (optional State)
 */
export const redirectArbitrary = fc.oneof(
  fc.constant(undefined),
  stateArbitrary,
);

/**
 * Arbitrary additional fields generator
 * Excludes reserved method names and dangerous keys
 */
export const customFieldsArbitrary = fc.dictionary(
  fc
    .string({ minLength: 1, maxLength: 20 })
    .filter(
      (key) =>
        ![
          "setCode",
          "setErrorInstance",
          "setAdditionalFields",
          "hasField",
          "getField",
          "toJSON",
        ].includes(key) &&
        !["code", "segment", "path", "redirect", "message", "stack"].includes(
          key,
        ) &&
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
    redirect: redirectArbitrary,
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
