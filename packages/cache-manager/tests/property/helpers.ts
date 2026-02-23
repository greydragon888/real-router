import { fc } from "@fast-check/vitest";

// ============================================================================
// Constants
// ============================================================================

/** Minimum valid maxSize for KeyIndexCache */
export const MIN_MAX_SIZE = 1;

/** Maximum maxSize used in property tests (keeps tests fast) */
export const MAX_MAX_SIZE = 100;

// ============================================================================
// Generators (Arbitraries)
// ============================================================================

/**
 * Valid maxSize generator — positive integer in a practical range
 */
export const maxSizeArbitrary = fc.integer({
  min: MIN_MAX_SIZE,
  max: MAX_MAX_SIZE,
});

/**
 * Cache key generator
 * Covers different patterns: simple, dotted (route names), with colons
 */
export const cacheKeyArbitrary = fc.oneof(
  fc.constant("home"),
  fc.constant("users.list"),
  fc.constant("users.profile.settings"),
  fc.constant("app.dashboard"),
  fc.stringMatching(/^[a-z][a-z0-9.]{0,29}$/),
);

/**
 * Cache value generator — various types that might be cached
 */
export const cacheValueArbitrary = fc.oneof(
  fc.string(),
  fc.integer(),
  fc.boolean(),
  fc.constant(null),
  fc.constant(undefined),
  fc.array(fc.string(), { maxLength: 5 }),
  fc.record({ id: fc.integer(), name: fc.string() }),
);

/**
 * Unique cache keys generator — array of distinct keys
 */
export const uniqueKeysArbitrary = (
  minLength = 1,
  maxLength = 50,
): fc.Arbitrary<string[]> =>
  fc.uniqueArray(cacheKeyArbitrary, { minLength, maxLength });

/**
 * Operation type for sequence testing
 */
export type CacheOp =
  | { type: "get"; key: string }
  | { type: "invalidate"; prefix: string }
  | { type: "clear" };

/**
 * Cache operation generator for random operation sequences
 */
export const cacheOpArbitrary: fc.Arbitrary<CacheOp> = fc.oneof(
  cacheKeyArbitrary.map((key) => ({ type: "get" as const, key })),
  fc.stringMatching(/^[a-z]{1,5}$/).map((prefix) => ({
    type: "invalidate" as const,
    prefix,
  })),
  fc.constant({ type: "clear" as const }),
);

/**
 * Sequence of cache operations
 */
export const cacheOpsArbitrary = fc.array(cacheOpArbitrary, {
  minLength: 1,
  maxLength: 200,
});
