// packages/react/tests/property/helpers.ts

import { fc } from "@fast-check/vitest";

// =============================================================================
// numRuns Constants
// =============================================================================

export const NUM_RUNS = {
  standard: 50,
  thorough: 200,
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
 * - Unicode incl. CJK / Latin-with-diacritics
 * - Emoji including ZWJ-composed sequences (must round-trip through encodeURI
 *   without breaking surrogate pairs)
 * - RTL text (Hebrew / Arabic) — encodeURI percent-encodes these, but a
 *   bidi-aware regression could mangle the byte order
 * - Strings starting with "#" (must be stripped by buildHref)
 * - Strings containing "#" (must be defensively replaced with "%23")
 * - Empty string (falsy — buildHref returns path without `#…`)
 */
export const arbHash: fc.Arbitrary<string> = fc.oneof(
  fc.string({ minLength: 0, maxLength: 24 }),
  fc.constantFrom(
    "section",
    "tab=1&q=x",
    "用户",
    "über",
    "a#b#c",
    "#leading",
    // Emoji: single codepoint + ZWJ-composed family + heart-variation-selector
    "❤️",
    "👨‍👩‍👧‍👦",
    "🎉section",
    // RTL: Hebrew + Arabic + mixed LTR/RTL
    "שלום",
    "مرحبا",
    "section-עברית",
  ),
);

/**
 * Extended primitive that also includes Object.is edge-cases:
 * NaN, ±0, BigInt, Symbol, null, undefined, Date.
 *
 * Note: Symbols are unique by construction (`Symbol()`), so wrapping in a
 * generator means each draw produces a fresh symbol. For Object.is checks
 * across two separate draws this still works because the test re-uses the
 * same drawn value when needed (`shallowEqual(o, o)` shares the symbol).
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
    null,
    undefined,
    1n,
    -1n,
    0n,
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
