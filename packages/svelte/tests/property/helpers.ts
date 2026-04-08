// packages/svelte/tests/property/helpers.ts

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
 * CSS class name — valid identifier-like string.
 */
export const arbClassName: fc.Arbitrary<string> = fc.stringMatching(
  /^[a-zA-Z][a-zA-Z0-9_-]{0,19}$/,
);

/**
 * Optional CSS class name — string or undefined.
 */
export const arbOptionalClassName: fc.Arbitrary<string | undefined> = fc.option(
  arbClassName,
  { nil: undefined },
);

/**
 * Mouse event properties for shouldNavigate testing.
 */
export const arbMouseEventProps: fc.Arbitrary<{
  button: number;
  metaKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
}> = fc.record({
  button: fc.integer({ min: 0, max: 5 }),
  metaKey: fc.boolean(),
  altKey: fc.boolean(),
  ctrlKey: fc.boolean(),
  shiftKey: fc.boolean(),
});
