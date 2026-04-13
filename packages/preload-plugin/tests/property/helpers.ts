// packages/preload-plugin/tests/property/helpers.ts

/**
 * Shared helpers for preload-plugin property-based tests.
 *
 * Provides:
 * - fast-check arbitraries for delay values, network conditions, event targets
 * - NUM_RUNS constants for controlling test iterations
 * - Navigator.connection mock helpers
 */

import { fc } from "@fast-check/vitest";

import type { PreloadPluginOptions } from "../../src/types";

// =============================================================================
// Constants
// =============================================================================

export const NUM_RUNS = 50;

// =============================================================================
// Arbitraries — Factory Options
// =============================================================================

/**
 * Arbitrary: valid delay value (positive integer, reasonable range).
 */
export const arbDelay: fc.Arbitrary<number> = fc.integer({ min: 0, max: 5000 });

/**
 * Arbitrary: complete PreloadPluginOptions with all fields set.
 */
export const arbFullOptions: fc.Arbitrary<Required<PreloadPluginOptions>> =
  fc.record({
    delay: arbDelay,
    networkAware: fc.boolean(),
  });

/**
 * Arbitrary: partial PreloadPluginOptions (any subset of fields).
 */
export const arbPartialOptions: fc.Arbitrary<Partial<PreloadPluginOptions>> =
  fc.record(
    {
      delay: arbDelay,
      networkAware: fc.boolean(),
    },
    { requiredKeys: [] },
  );

// =============================================================================
// Arbitraries — Network Conditions
// =============================================================================

/**
 * Effective connection types defined by the Network Information API.
 * "slow-2g" and "2g" are slow; "3g" and "4g" are fast.
 */
export const arbSlowEffectiveType: fc.Arbitrary<string> = fc.constantFrom(
  "slow-2g",
  "2g",
);

export const arbFastEffectiveType: fc.Arbitrary<string> = fc.constantFrom(
  "3g",
  "4g",
);

/**
 * Arbitrary: any string that contains "2g" as a substring.
 * Tests that `.includes("2g")` works for non-standard effectiveType values.
 */
export const arbEffectiveTypeWith2g: fc.Arbitrary<string> = fc
  .tuple(
    fc.string({ maxLength: 5, unit: "grapheme" }),
    fc.constantFrom("2g", "slow-2g"),
    fc.string({ maxLength: 5, unit: "grapheme" }),
  )
  .map(([prefix, core, suffix]) => prefix + core + suffix);

// =============================================================================
// Arbitraries — Ghost Event Timing
// =============================================================================

/** Arbitrary: timestamp delta within the ghost event threshold (0..2499ms). */
export const arbWithinThreshold: fc.Arbitrary<number> = fc.integer({
  min: 0,
  max: 2499,
});

/** Arbitrary: timestamp delta at or beyond the ghost event threshold (2500ms+). */
export const arbBeyondThreshold: fc.Arbitrary<number> = fc.integer({
  min: 2500,
  max: 10_000,
});

/** Arbitrary: timestamp delta below zero (clock skew / synthetic events). */
export const arbNegativeDelta: fc.Arbitrary<number> = fc.integer({
  min: -10_000,
  max: -1,
});

/** Arbitrary: base timestamp for touch events. */
export const arbBaseTimestamp: fc.Arbitrary<number> = fc.integer({
  min: 0,
  max: 100_000,
});

// =============================================================================
// Navigator.connection Mock Helpers
// =============================================================================

interface NavigatorConnection {
  saveData?: boolean;
  effectiveType?: string;
}

/**
 * Mock `navigator.connection` with given properties.
 * Returns a cleanup function that restores the original state.
 */
export function mockNavigatorConnection(
  connection: NavigatorConnection | undefined,
): () => void {
  const nav = navigator as Navigator & { connection?: NavigatorConnection };
  const original = Object.getOwnPropertyDescriptor(nav, "connection");

  if (connection === undefined) {
    // Remove connection property entirely
    if ("connection" in nav) {
      delete (nav as unknown as Record<string, unknown>).connection;
    }
  } else {
    Object.defineProperty(nav, "connection", {
      value: connection,
      configurable: true,
      writable: true,
    });
  }

  return () => {
    if (original) {
      Object.defineProperty(nav, "connection", original);
    } else if ("connection" in nav) {
      delete (nav as unknown as Record<string, unknown>).connection;
    }
  };
}
