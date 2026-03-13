import { fc } from "@fast-check/vitest";

import { RxObservable } from "../../src/RxObservable";

// =============================================================================
// Number of runs
// =============================================================================

/** Number of fast-check iterations per test category */
export const NUM_RUNS = {
  fast: 100,
  standard: 200,
} as const;

// =============================================================================
// Observable utilities
// =============================================================================

/**
 * Creates a synchronous cold observable from a fixed array of values.
 * Each subscription re-emits all values synchronously in order.
 */
export function makeSource<T>(values: T[]): RxObservable<T> {
  return new RxObservable<T>((observer) => {
    for (const value of values) {
      observer.next?.(value);
    }
  });
}

/**
 * Collects all values emitted by a synchronous observable.
 * Returns the collected values in emission order.
 */
export function collectSync<T>(obs: RxObservable<T>): T[] {
  const results: T[] = [];

  obs.subscribe({ next: (v) => results.push(v) });

  return results;
}

// =============================================================================
// Arbitraries
// =============================================================================

/** Array of bounded integers (bounded for determinism and performance) */
export const arbIntArray = fc.array(fc.integer({ min: -100, max: 100 }), {
  minLength: 0,
  maxLength: 20,
});

/** Non-empty array of bounded integers */
export const arbNonEmptyIntArray = fc.array(
  fc.integer({ min: -100, max: 100 }),
  { minLength: 1, maxLength: 20 },
);

/**
 * Arbitrary integer-to-integer function.
 * fast-check generates pure, deterministic functions.
 */
export const arbNumFn: fc.Arbitrary<(x: number) => number> = fc
  .func(fc.integer({ min: -10_000, max: 10_000 }))
  .map((f) => (x: number) => f(x));

/**
 * Arbitrary integer-to-boolean predicate.
 * fast-check generates pure, deterministic predicates.
 */
export const arbNumPred: fc.Arbitrary<(x: number) => boolean> = fc
  .func(fc.boolean())
  .map((f) => (x: number) => f(x));
