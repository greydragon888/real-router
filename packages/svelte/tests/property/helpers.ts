// packages/svelte/tests/property/helpers.ts

import { fc } from "@fast-check/vitest";

// =============================================================================
// numRuns Constants
// =============================================================================

/**
 * Per `tests/property/.claude/review-2026-05-10.md` §2.3:
 * - `standard` = 100 — old 50 baseline was too low for multi-field generators
 *   (shouldNavigate cmd⇄ctrl swap, buildActiveClassName Set-dedup);
 *   100 matches the fast-check default and gives adequate sensitivity without
 *   slowing the property suite.
 * - `thorough` = 200 — for invariants with wide combinatorics (shallowEqual
 *   over Object.is edge cases — Symbol, Date, BigInt, NaN, ±0; buildHref
 *   hash-encoding across the full RFC 3986 surface).
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
 *
 * Conservative ASCII-lowercase shape — see `arbSegmentNameExtended` for the
 * fuller surface accepted by route-utils' `SAFE_SEGMENT_PATTERN`.
 */
export const arbSegmentName: fc.Arbitrary<string> =
  fc.stringMatching(/^[a-z]{1,10}$/);

/**
 * Segment name with the full ASCII surface accepted by route-utils'
 * `SAFE_SEGMENT_PATTERN` (`/^[\w.-]+$/` — letters, digits, `_`, `-`).
 *
 * Closes review §2.4: `arbSegmentName` did not exercise digits, dashes, or
 * underscores, which are common in real-world route names (`users-list`,
 * `posts_2024`, `v1.users`).
 *
 * Note: Unicode is NOT included even though the review listed it as a gap —
 * `\w` in route-utils' regex does not have the `u` flag, so non-ASCII
 * characters fail validation at runtime. Including them in the generator
 * would shape-shift the test into "does route-utils reject Unicode?" rather
 * than "does the helper hold for valid input."
 */
export const arbSegmentNameExtended: fc.Arbitrary<string> = fc.stringMatching(
  /^[a-zA-Z0-9_-]{1,10}$/,
);

/**
 * Dotted route name — 1 to 4 segments joined with ".".
 * Represents names like "users", "users.list", "admin.settings.theme".
 */
export const arbDottedName: fc.Arbitrary<string> = fc
  .array(arbSegmentName, { minLength: 1, maxLength: 4 })
  .map((segments) => segments.join("."));

/**
 * Dotted route name composed from `arbSegmentNameExtended`. Mirrors
 * `arbDottedName` but with the broader ASCII alphabet — digits and `-`/`_`
 * are common in real-world route names (`users-list`, `posts_2024`).
 * Closes review §2.4 gap on `arbDottedName`.
 */
export const arbDottedNameExtended: fc.Arbitrary<string> = fc
  .array(arbSegmentNameExtended, { minLength: 1, maxLength: 4 })
  .map((segments) => segments.join("."));

/**
 * Known route names for testing with realistic values.
 *
 * Closes review §2.4 "dead code" flag: `arbRouteName` is now exercised by
 * `navigateWithHash.properties.ts` (every invariant in that file).
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
 * Route name with edge-case depths: single segment (1) up to deeply nested (6).
 *
 * `arbRouteName` only emits a hand-picked set of 1–2-deep names; this widens
 * the depth surface to catch regressions on prefix logic at unusual depths.
 * Closes review §2.4 gap on `arbRouteName`'s narrow `constantFrom` domain.
 */
export const arbRouteNameWide: fc.Arbitrary<string> = fc
  .array(arbSegmentName, { minLength: 1, maxLength: 6 })
  .map((segments) => segments.join("."));

/**
 * CSS class name — valid single-token identifier.
 *
 * Real-world `className` values are usually multi-token (`"btn btn-primary"`).
 * For those cases use `arbMultiTokenActiveClassName` below; this single-token
 * generator is retained for invariants that need a guaranteed one-token shape
 * (the "active token appears exactly once" invariant relies on this).
 */
export const arbClassName: fc.Arbitrary<string> = fc.stringMatching(
  /^[a-zA-Z][a-zA-Z0-9_-]{0,19}$/,
);

/**
 * Optional CSS class name — `string | undefined`, with `""` explicitly in the
 * value space.
 *
 * Closes review §2.4 gap: empty-string base triggers the `!baseClassName`
 * branch in `buildActiveClassName` (line 162 — fallback `activeTokens.join(" ")`
 * is exercised only when base is falsy). Without `""` in the domain, the
 * branch is reachable but not driven by property tests.
 *
 * Distribution: `undefined` (1/3), `""` (1/3), generated className (1/3).
 */
export const arbOptionalClassName: fc.Arbitrary<string | undefined> = fc.oneof(
  fc.constant(undefined),
  fc.constant(""),
  arbClassName,
);

/**
 * Mouse event properties for shouldNavigate testing.
 *
 * Standard event shape: button ∈ [0, 5], boolean modifiers. The audit (§2.4)
 * flagged this as OK — the `MouseEvent.button` spec defines exactly five
 * named values (0=main, 1=auxiliary, 2=secondary, 3=back, 4=forward), and
 * shouldNavigate already short-circuits on `!== 0`. For NaN / negative-button
 * edge cases see `arbMouseEventPropsExtended`.
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

/**
 * Mouse event properties with hostile button values — covers NaN and negative
 * integers. Real browsers never emit these, but custom synthetic events from
 * libraries (e.g. testing-library `fireEvent`) can, and the `button === 0`
 * strict-equality check in shouldNavigate must reject them as a non-zero
 * button (i.e. NOT navigate).
 *
 * Closes review §2.4 "edge cases not covered" — NaN, negative button.
 */
export const arbMouseEventPropsExtended: fc.Arbitrary<{
  button: number;
  metaKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
}> = fc.record({
  button: fc.oneof(
    fc.integer({ min: -10, max: -1 }),
    fc.constantFrom(Number.NaN, Infinity, -Infinity),
    fc.integer({ min: 6, max: 100 }),
  ),
  metaKey: fc.boolean(),
  altKey: fc.boolean(),
  ctrlKey: fc.boolean(),
  shiftKey: fc.boolean(),
});

// =============================================================================
// Arbitraries — buildActiveClassName / parseTokens
// =============================================================================

/**
 * Single CSS token without whitespace — covers both ASCII letters and digits,
 * plus `-` (real-world BEM-style classes like `btn-primary`, `tab-2`).
 */
export const arbToken: fc.Arbitrary<string> = fc.stringMatching(
  /^[a-z][a-z0-9-]{0,8}$/,
);

/**
 * Whitespace padding samples — covers space, tab, newline, CR, mixed.
 * `parseTokens` uses `/\S+/g`; a regression to `/[^ ]+/g` would silently fail
 * on tab/newline-padded class strings.
 */
export const arbWhitespacePadding: fc.Arbitrary<string> = fc.oneof(
  fc.constant(""),
  fc.constant(" "),
  fc.constant("  "),
  fc.constant("\t"),
  fc.constant("\n"),
  fc.constant("\r"),
  fc.constant(" \t"),
  fc.constant("\n  "),
);

/**
 * Base className composed of N tokens separated by double-space, optionally
 * padded with mixed whitespace — exercises parseTokens against irregular input
 * via every buildActiveClassName call.
 */
export const arbBaseClassName: fc.Arbitrary<string> = fc
  .tuple(
    arbWhitespacePadding,
    fc.array(arbToken, { minLength: 0, maxLength: 4 }),
    arbWhitespacePadding,
  )
  .map(([head, tokens, tail]) => `${head}${tokens.join("  ")}${tail}`);

/** Single-token active className (mirrors preact's `arbActiveClassName`). */
export const arbActiveClassName: fc.Arbitrary<string> = arbToken;

/**
 * Multi-token active className — covers buildActiveClassName's main real-world
 * use case (`<Link activeClassName="active highlighted">`). Single-token
 * `arbClassName` misses ordering and dedup invariants.
 */
export const arbMultiTokenActiveClassName: fc.Arbitrary<string> = fc
  .array(arbToken, { minLength: 2, maxLength: 5 })
  .map((tokens) => tokens.join(" "));

// =============================================================================
// Arbitraries — route params / hash
// =============================================================================

export type Primitive = string | number | boolean;

/** Primitive value — string, number, or boolean. */
export const arbPrimitive: fc.Arbitrary<Primitive> = fc.oneof(
  fc.string({ minLength: 0, maxLength: 20 }),
  fc.integer({ min: -1000, max: 1000 }),
  fc.boolean(),
);

/** Dictionary of primitive values for route params / route options. */
export const arbParams: fc.Arbitrary<Record<string, Primitive>> = fc.dictionary(
  fc.stringMatching(/^[a-z]{1,8}$/),
  arbPrimitive,
  {
    minKeys: 0,
    maxKeys: 5,
  },
);

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
// Arbitraries — shallowEqual (Object.is edge cases)
// =============================================================================

/**
 * Two stable Symbol references — `Object.is(symbol, symbol)` returns true for
 * identical refs, false for distinct refs. `Symbol.for(...)` returns the same
 * registered symbol across property iterations.
 */
export const SYMBOL_A: symbol = Symbol.for("svelte-pbt-symbol-a");

export const SYMBOL_B: symbol = Symbol.for("svelte-pbt-symbol-b");

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
 *
 * `minKeys: 0` includes the empty-object case `{}` — closes review §2.4
 * "edge cases not covered: empty string / empty object". Two empty objects
 * compare equal under shallowEqual (`Object.keys({}).length === 0` →
 * vacuously true loop).
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
 * Date instances. Used to lock the "shallowEqual does NOT deep compare"
 * contract: two records with structurally identical but distinctly-allocated
 * nested objects must compare unequal.
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
