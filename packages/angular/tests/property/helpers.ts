// packages/angular/tests/property/helpers.ts

/**
 * Shared arbitraries for the Angular property suite.
 *
 * Angular's `src/dom-utils/` is a **git-tracked copy** of `shared/dom-utils/`
 * (not a symlink — ng-packagr doesn't follow them the same way tsdown does).
 * The property tests exercise the copy by direct import; if anyone forgets to
 * run `pnpm -F @real-router/angular bundle` after editing the shared source,
 * the property suite is the canary that catches the drift.
 *
 * Arbitraries mirror `packages/svelte/tests/property/helpers.ts` so the two
 * suites stay in lockstep — the same functions, the same invariant surface.
 */

import { fc } from "@fast-check/vitest";

// =============================================================================
// numRuns Constants
// =============================================================================

/**
 * - `standard` = 100 — matches fast-check default; adequate sensitivity without
 *   slowing the suite.
 * - `thorough` = 200 — for invariants with wide combinatorics (shallowEqual
 *   Object.is edges; buildHref RFC 3986 surface).
 * - `extensive` = 500 — for invariants whose generator surface is wide enough
 *   that `thorough` leaves noticeable corners unexplored (review-2026-05-16
 *   §2.3 — `shallowEqual` key-order insensitivity with 4-key records,
 *   `buildHref` hash encoding across the full RFC 3986 sub-delims band).
 */
export const NUM_RUNS = {
  standard: 100,
  thorough: 200,
  extensive: 500,
} as const;

// =============================================================================
// Arbitraries — segment / route name
// =============================================================================

/** Lowercase ASCII segment 1–10 chars. */
export const arbSegmentName: fc.Arbitrary<string> =
  fc.stringMatching(/^[a-z]{1,10}$/);

/** Full ASCII surface accepted by route-utils' `SAFE_SEGMENT_PATTERN`. */
export const arbSegmentNameExtended: fc.Arbitrary<string> = fc.stringMatching(
  /^[a-zA-Z0-9_-]{1,10}$/,
);

/** Dotted route name composed from `arbSegmentName`. */
export const arbDottedName: fc.Arbitrary<string> = fc
  .array(arbSegmentName, { minLength: 1, maxLength: 4 })
  .map((segments) => segments.join("."));

/** Dotted route name with extended ASCII (digits, `-`, `_`). */
export const arbDottedNameExtended: fc.Arbitrary<string> = fc
  .array(arbSegmentNameExtended, { minLength: 1, maxLength: 4 })
  .map((segments) => segments.join("."));

/** Hand-picked realistic names — 1–2-deep. */
export const arbRouteName: fc.Arbitrary<string> = fc.constantFrom(
  "home",
  "users",
  "users.list",
  "users.view",
  "admin",
  "admin.settings",
);

/** Wide-depth route name (1–6 segments) — exercises prefix logic at depth. */
export const arbRouteNameWide: fc.Arbitrary<string> = fc
  .array(arbSegmentName, { minLength: 1, maxLength: 6 })
  .map((segments) => segments.join("."));

// =============================================================================
// Arbitraries — className / tokens
// =============================================================================

/** Single-token className. */
export const arbClassName: fc.Arbitrary<string> = fc.stringMatching(
  /^[a-zA-Z][a-zA-Z0-9_-]{0,19}$/,
);

/**
 * Optional className with `""` explicitly in the value space — drives the
 * `!baseClassName` branch in `buildActiveClassName`.
 *
 * Distribution: `undefined` (1/3), `""` (1/3), generated className (1/3).
 */
export const arbOptionalClassName: fc.Arbitrary<string | undefined> = fc.oneof(
  fc.constant(undefined),
  fc.constant(""),
  arbClassName,
);

/** Single CSS token. */
export const arbToken: fc.Arbitrary<string> = fc.stringMatching(
  /^[a-z][a-z0-9-]{0,8}$/,
);

/** Whitespace padding samples — exercises `/\S+/g` parsing. */
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

/** Base className with mixed whitespace padding and irregular separators. */
export const arbBaseClassName: fc.Arbitrary<string> = fc
  .tuple(
    arbWhitespacePadding,
    fc.array(arbToken, { minLength: 0, maxLength: 4 }),
    arbWhitespacePadding,
  )
  .map(([head, tokens, tail]) => `${head}${tokens.join("  ")}${tail}`);

/** Single-token active className (mirrors svelte's `arbActiveClassName`). */
export const arbActiveClassName: fc.Arbitrary<string> = arbToken;

/** Multi-token active className — exercises ordering / dedup invariants. */
export const arbMultiTokenActiveClassName: fc.Arbitrary<string> = fc
  .array(arbToken, { minLength: 2, maxLength: 5 })
  .map((tokens) => tokens.join(" "));

// =============================================================================
// Stable Symbol references — used by mouse-event hostile generator and the
// shallowEqual arbitraries. Object.for ensures identity across draws.
// =============================================================================

export const SYMBOL_A: symbol = Symbol.for("angular-pbt-symbol-a");

export const SYMBOL_B: symbol = Symbol.for("angular-pbt-symbol-b");

// =============================================================================
// Arbitraries — mouse events
// =============================================================================

/** Standard mouse event shape — `button` ∈ [0, 5], boolean modifiers. */
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
 * Hostile button values — NaN, ±Infinity, negative, out-of-range.
 *
 * Audit 2026-05-16 §2.2: button is widened to `unknown` and the generator now
 * also yields `null`, `undefined`, fractional numbers (0.5, -0.0000001),
 * BigInts, Symbols, the string `"0"`, and `true`/`false`. The `shouldNavigate`
 * Inv 6 contract — strict `evt.button === 0` rejects every non-`number-0`
 * value — must hold against this entire hostile surface.
 */
export const arbMouseEventPropsExtended: fc.Arbitrary<{
  button: unknown;
  metaKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
}> = fc.record({
  button: fc.oneof(
    fc.integer({ min: -10, max: -1 }),
    fc.constantFrom(
      Number.NaN,
      Infinity,
      -Infinity,
      // Fractional values inside the "valid range" — strict === 0 still rejects
      0.5,
      0.0000001,
      -0.0000001,
      // null / undefined — synthetic events from custom dispatch may omit the field
      null,
      undefined,
      // BigInt / Symbol — frameworks rarely allow these, but the function must not throw
      0n,
      1n,
      SYMBOL_A,
      // Strings (string "0" is the classic == 0 vs === 0 trap)
      "0",
      "",
      "left",
      // Booleans — Number(true) === 1, but strict === 0 still rejects
      true,
      false,
    ),
    fc.integer({ min: 6, max: 100 }),
  ),
  metaKey: fc.boolean(),
  altKey: fc.boolean(),
  ctrlKey: fc.boolean(),
  shiftKey: fc.boolean(),
});

// =============================================================================
// Arbitraries — route params / hash
// =============================================================================

export type Primitive = string | number | boolean;

export const arbPrimitive: fc.Arbitrary<Primitive> = fc.oneof(
  fc.string({ minLength: 0, maxLength: 20 }),
  fc.integer({ min: -1000, max: 1000 }),
  fc.boolean(),
);

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
 * - Strings starting with "#" (must be stripped)
 * - Strings containing "#" (must be defensively replaced with "%23")
 * - Empty string (falsy — path returned without `#…`)
 *
 * Audit 2026-05-16 §2.2: extended the `constantFrom` band with the full set of
 * RFC 3986 sub-delims (`!$&'()*+,;=`), gen-delims (`?[]@:/`), and a long-tail
 * Unicode mix (CJK + BMP astral). Without these, `Invariant 5` (hash encoding)
 * never exercised the "sub-delims survive encodeURI verbatim" property — the
 * arbHash band landed on `tab=1&q=x` (one sample) and never on `?`, `[`, `]`.
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
    // RFC 3986 sub-delims — preserved verbatim by encodeURI
    "!",
    "$",
    "&",
    "'",
    "(",
    ")",
    "*",
    "+",
    ",",
    ";",
    "=",
    // gen-delims allowed inside a fragment by RFC 3986 §3.5
    "?",
    "[",
    "]",
    "@",
    ":",
    "/",
    // Combined spec-critical strings — multiple delims at once
    "a?b&c=d",
    "foo[0]=bar",
    "user@host:8080",
    "a/b/c?q=1&r=2",
    "'(quoted)*",
    // Spec-critical chars with leading `#` — stripping + re-encoding both fire
    "#a?b",
    "#[index]",
    // Unicode long-tail — astral plane + combining marks + RTL
    "🚀",
    "café",
    "אבג",
    "한국어",
    "😀", // U+1F600 GRINNING FACE
  ),
);

// =============================================================================
// Arbitraries — shallowEqual (Object.is edge cases)
// =============================================================================

/**
 * Primitive covering every Object.is edge case relevant to `shallowEqual`:
 * NaN, ±Infinity, ±0, MAX/MIN safe int, EPSILON, null, undefined, BigInt,
 * Symbol pair.
 *
 * Audit 2026-05-16 §2.2: added `Number.MIN_VALUE` (smallest positive
 * denormal), `Number.MAX_VALUE` (largest finite double), `-Number.MIN_VALUE`,
 * `Number.MIN_SAFE_INTEGER - 1` / `Number.MAX_SAFE_INTEGER + 1` (just outside
 * safe range), and large BigInts (>10^18) that exceed `Number.MAX_SAFE_INTEGER`
 * so the `Object.is(1n, 1n)` invariant proves it doesn't silently coerce.
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
    Number.MIN_VALUE, // 5e-324 — smallest positive denormal
    -Number.MIN_VALUE,
    Number.MAX_VALUE, // 1.7976931348623157e+308 — largest finite double
    -Number.MAX_VALUE,
    Number.MAX_SAFE_INTEGER + 1, // first integer that loses precision
    Number.MIN_SAFE_INTEGER - 1,
    null,
    undefined,
    1n,
    -1n,
    0n,
    9_223_372_036_854_775_807n, // BigInt > 10^18 (Int64 max)
    -9_223_372_036_854_775_808n,
    1_000_000_000_000_000_000_000_000_000_000n, // 10^30 — way past double precision
    SYMBOL_A,
    SYMBOL_B,
  ),
);

export const arbExtendedRecord: fc.Arbitrary<Record<string, unknown>> =
  fc.dictionary(fc.stringMatching(/^[a-z]{1,4}$/), arbExtendedPrimitive, {
    minKeys: 0,
    maxKeys: 4,
  });

/** Fresh `Date` per draw — two draws of equal epoch are still distinct refs. */
export const arbDate: fc.Arbitrary<Date> = fc
  .integer({ min: 0, max: 4_102_444_800_000 })
  .map((ms) => new Date(ms));

/**
 * Records carrying nested objects + Date — locks "no deep compare" contract.
 *
 * Audit 2026-05-16 §2.2: depth is no longer fixed at 2 levels; the generator
 * now produces records of variable depth 1-3 and includes arrays as values so
 * `shallowEqual` invariants 8 and 9 (Date / nested objects compared by
 * reference, never deep-compared) are exercised across a wider value-tree
 * surface. Cyclical references stay out of scope on purpose — Object.is on a
 * cycle is well-defined (true) but would never appear in router state.
 */
function recordOfDepth(depth: number): fc.Arbitrary<Record<string, unknown>> {
  return fc.dictionary(
    fc.stringMatching(/^[a-z]{1,4}$/),
    depth <= 0
      ? fc.oneof(arbExtendedPrimitive, arbDate)
      : fc.oneof(
          { arbitrary: arbExtendedPrimitive, weight: 5 },
          { arbitrary: arbDate, weight: 2 },
          {
            arbitrary: fc.array(arbExtendedPrimitive, { maxLength: 4 }),
            weight: 1,
          },
          { arbitrary: recordOfDepth(depth - 1), weight: 1 },
        ),
    { minKeys: 0, maxKeys: 4 },
  );
}

export const arbDeepRecord: fc.Arbitrary<Record<string, unknown>> = fc
  .integer({ min: 1, max: 3 })
  .chain((depth) => recordOfDepth(depth));
