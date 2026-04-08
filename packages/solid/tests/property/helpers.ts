// packages/solid/tests/property/helpers.ts

import { fc } from "@fast-check/vitest";

// =============================================================================
// numRuns Constants
// =============================================================================

export const NUM_RUNS = {
  standard: 50,
  thorough: 100,
} as const;

// =============================================================================
// Arbitraries
// =============================================================================

/**
 * Lowercase alpha segment name (1-10 chars).
 * Represents a single route segment like "users", "home", "admin".
 */
export const arbSegmentName: fc.Arbitrary<string> =
  fc.stringMatching(/^[a-z]{1,10}$/);

/**
 * Dotted route name — 1 to 4 segments joined with ".".
 * Represents names like "users", "users.list", "admin.settings.theme".
 */
export const arbDottedName: fc.Arbitrary<string> = fc
  .array(arbSegmentName, { minLength: 1, maxLength: 4 })
  .map((segments) => segments.join("."));

/**
 * Known route names for testing with realistic values.
 */
export const arbRouteName: fc.Arbitrary<string> = fc.constantFrom(
  "home",
  "users",
  "users.list",
  "users.view",
  "admin",
  "admin.settings",
);

/**
 * Primitive value — string, number, or boolean.
 */
export const arbPrimitive: fc.Arbitrary<string | number | boolean> = fc.oneof(
  fc.string({ minLength: 0, maxLength: 20 }),
  fc.integer({ min: -1000, max: 1000 }),
  fc.boolean(),
);

/**
 * Dictionary of primitive values for route params / route options.
 */
export const arbParams: fc.Arbitrary<
  Record<string, string | number | boolean>
> = fc.dictionary(fc.stringMatching(/^[a-z]{1,8}$/), arbPrimitive, {
  minKeys: 0,
  maxKeys: 5,
});
