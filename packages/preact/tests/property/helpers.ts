// packages/preact/tests/property/helpers.ts

import { fc } from "@fast-check/vitest";

// =============================================================================
// numRuns Constants
// =============================================================================

/**
 * Per `tests/property/.claude/review-2026-05-10.md` §2.3:
 * - `standard` = 100 — for 11-field comparators (areLinkPropsEqual) the 50-run
 *   baseline is too low; bump gives adequate sensitivity coverage without
 *   slowing the property suite materially.
 * - `thorough` = 200 — for invariants whose combinatorics scale with field
 *   count (areLinkPropsEqual reflexivity/symmetry over hash + 10 other fields)
 *   or whose generator domains are wide (shallowEqual over Object.is edge
 *   cases including Symbol, Date, BigInt, NaN, ±0).
 */
export const NUM_RUNS = {
  standard: 100,
  thorough: 200,
} as const;

// =============================================================================
// Arbitraries — basic
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

export type Primitive = string | number | boolean;

/**
 * Primitive value — string, number, or boolean.
 */
export const arbPrimitive: fc.Arbitrary<Primitive> = fc.oneof(
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

/**
 * Hash fragment generator covering:
 * - ASCII strings (sub-delims preserved by encodeURI)
 * - Unicode (must be percent-encoded by encodeURI)
 * - Strings starting with "#" (must be stripped by buildHref)
 * - Strings containing "#" (must be defensively replaced with "%23")
 * - Empty string (falsy — buildHref returns path without `#…`)
 */
export const arbHash: fc.Arbitrary<string> = fc.oneof(
  fc.string({ minLength: 0, maxLength: 24 }),
  fc.constantFrom("section", "tab=1&q=x", "用户", "über", "a#b#c", "#leading"),
);

// =============================================================================
// Arbitraries — extended segment domain
// =============================================================================

/**
 * Segment name with the full ASCII surface accepted by route-utils'
 * `SAFE_SEGMENT_PATTERN` (`/^[\w.-]+$/` — letters, digits, `_`, `-`).
 *
 * Note: Unicode is NOT included even though the review (§2.4) listed it as a
 * gap — `\w` in route-utils' regex does not have the `u` flag, so non-ASCII
 * characters fail validation at runtime. Including them in the generator
 * would shape-shift the test into "does route-utils reject Unicode?" rather
 * than "does isSegmentMatch hold for valid input."
 */
export const arbSegmentNameExtended: fc.Arbitrary<string> = fc.stringMatching(
  /^[a-zA-Z0-9_-]{1,10}$/,
);

/**
 * Dotted route name composed from `arbSegmentNameExtended`. Mirrors
 * `arbDottedName` but with the broader ASCII alphabet — digits and `-`/`_`
 * are common in real-world route names (`users-list`, `posts_2024`).
 */
export const arbDottedNameExtended: fc.Arbitrary<string> = fc
  .array(arbSegmentNameExtended, { minLength: 1, maxLength: 4 })
  .map((segments) => segments.join("."));

/**
 * Route name with edge-case depths: single segment (1) up to deeply nested (6).
 * `arbRouteName` only emits a hand-picked set of 1–2-deep names; this widens
 * the depth surface to catch regressions on prefix logic at unusual depths.
 */
export const arbRouteNameWide: fc.Arbitrary<string> = fc
  .array(arbSegmentName, { minLength: 1, maxLength: 6 })
  .map((segments) => segments.join("."));

// =============================================================================
// Arbitraries — extended primitive / record domains
// =============================================================================

/**
 * Two stable Symbol references, used by shallowEqual tests that need
 * `Object.is(symbol, symbol) === true` for one and `=== false` for the other.
 * Wrapping `Symbol()` in `fc.constant` would freeze a single value; using
 * `Symbol.for(...)` ensures referential equality across multiple property
 * iterations (it returns the same registered symbol).
 */
export const SYMBOL_A: symbol = Symbol.for("preact-pbt-symbol-a");

export const SYMBOL_B: symbol = Symbol.for("preact-pbt-symbol-b");

/**
 * Extended primitive covering every Object.is edge-case relevant to
 * `shallowEqual`:
 *
 * - `NaN` — `Object.is(NaN, NaN) === true` (`===` would return false)
 * - `±Infinity` — numeric extremes outside `arbPrimitive`'s ±1000 range
 * - `+0` / `-0` — `Object.is(+0, -0) === false` (`===` would return true)
 * - `Number.MAX_SAFE_INTEGER` / `MIN_SAFE_INTEGER` / `EPSILON` — boundary
 *   values that fall outside `arbPrimitive`'s integer range
 * - `null` / `undefined` — distinct under Object.is
 * - `BigInt` — separate primitive type; Object.is operates on identity-equal
 *   bigints
 * - `Symbol` — pair of stable refs (SYMBOL_A, SYMBOL_B) so identity-equal
 *   draws stay identity-equal across iterations
 */
export const arbExtendedPrimitive: fc.Arbitrary<unknown> = fc.oneof(
  fc.string({ minLength: 0, maxLength: 12 }),
  fc.integer({ min: -1000, max: 1000 }),
  fc.boolean(),
  fc.constantFrom(
    Number.NaN,
    Infinity,
    -Infinity,
    0,
    -0,
    Number.MAX_SAFE_INTEGER,
    Number.MIN_SAFE_INTEGER,
    Number.EPSILON,
    null,
    undefined,
    1n,
    -1n,
    0n,
    SYMBOL_A,
    SYMBOL_B,
  ),
);

/**
 * Object with a fixed set of keys and arbitrary primitive values.
 * Used to exercise `shallowEqual` semantics over Object.is values.
 */
export const arbExtendedRecord: fc.Arbitrary<Record<string, unknown>> =
  fc.dictionary(fc.stringMatching(/^[a-z]{1,4}$/), arbExtendedPrimitive, {
    minKeys: 0,
    maxKeys: 4,
  });

/**
 * Date generator producing fresh `Date` instances. Two draws with the same
 * epoch value yield distinct references — exactly what shallowEqual's
 * "different refs to equal-by-value objects" invariant needs.
 */
export const arbDate: fc.Arbitrary<Date> = fc
  .integer({ min: 0, max: 4_102_444_800_000 })
  .map((ms) => new Date(ms));

/**
 * Record carrying values from `arbExtendedPrimitive` PLUS nested objects and
 * Date instances. Used to lock the documented "shallowEqual does NOT deep
 * compare" contract (CLAUDE.md L230): two records with structurally identical
 * but distinctly-allocated nested objects must compare unequal.
 *
 * Keys are 1–4 lowercase letters (same shape as `arbExtendedRecord`). Values
 * are either an extended primitive, a fresh Date, or a `{ x: number }` object
 * — enough variety to exercise the Object.is per-key path without bloating
 * the generator.
 */
export const arbDeepRecord: fc.Arbitrary<Record<string, unknown>> =
  fc.dictionary(
    fc.stringMatching(/^[a-z]{1,4}$/),
    fc.oneof(
      arbExtendedPrimitive,
      arbDate,
      fc
        .integer({ min: -100, max: 100 })
        .map((x): Record<string, unknown> => ({ x })),
    ),
    { minKeys: 0, maxKeys: 4 },
  );
