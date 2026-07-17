import { fc } from "@fast-check/vitest";

import { build } from "../../../src/search-params";

import type {
  ArrayFormat,
  BooleanFormat,
  NullFormat,
  NumberFormat,
  Options,
  QueryParamPrimitive,
  QueryParamValue,
  SearchParams,
} from "../../../src/search-params";

export const NUM_RUNS = {
  standard: 100,
  lifecycle: 50,
  async: 30,
} as const;

// eslint-disable-next-line @typescript-eslint/no-misused-spread -- ASCII-only chars, no emoji risk
const KEY_CHARS = [..."abcdefghijklmnopqrstuvwxyz0123456789"];

// minLength 0 — the empty-string key `""` is a type-valid `SearchParams` key
// (`Record<string, …>`), so the roundtrip suite must exercise it. It round-trips
// in every config except `true`/`null` under `empty-true` (the bare-key token for
// `""` is `""`, which build's empty-chunk filter drops — a documented loss,
// #1051/#18); those combos are excluded in the roundtrip property and asserted
// explicitly in formats.properties.ts.
export const arbSafeKey: fc.Arbitrary<string> = fc.string({
  unit: fc.constantFrom(...KEY_CHARS),
  minLength: 0,
  maxLength: 8,
});

/**
 * Whether `build` erases the empty-string key `""` for this params/opts (#1051).
 * The empty key is dropped whenever its value encodes to a BARE-KEY token (no
 * `=`), because that token is `""` itself — which `build`'s empty-chunk filter
 * removes (`searchParams.ts`, the same filter that erases `nullFormat:"hidden"`).
 * The bare-key encoders: `true` under `booleanFormat:"empty-true"`, and `null`
 * under `nullFormat:"default"`. Every other value encodes as `=value` (a
 * non-empty chunk) and round-trips. Used to exclude this documented loss from the
 * roundtrip / format properties — the loss is asserted explicitly instead.
 */
export function erasesEmptyKey(
  params: Record<string, unknown>,
  opts: { booleanFormat?: string; nullFormat?: string } = {},
): boolean {
  if (!("" in params)) {
    return false;
  }

  const value = params[""];

  return (
    (value === true && opts.booleanFormat === "empty-true") ||
    (value === null && (opts.nullFormat ?? "default") === "default")
  );
}

const SAFE_CHARS = [
  // eslint-disable-next-line @typescript-eslint/no-misused-spread -- ASCII-only chars, no emoji risk
  ..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
];

export const arbSafeString: fc.Arbitrary<string> = fc.string({
  unit: fc.constantFrom(...SAFE_CHARS),
  minLength: 0,
  maxLength: 15,
});

// Characters that require percent-encoding in query strings
const ENCODABLE_CHARS = [...SAFE_CHARS, " ", "&", "=", "?", "#", "+", "/"];

export const arbEncodableString: fc.Arbitrary<string> = fc.string({
  unit: fc.constantFrom(...ENCODABLE_CHARS),
  minLength: 0,
  maxLength: 10,
});

export const arbSearchParamsEncodable: fc.Arbitrary<Record<string, string>> =
  fc.dictionary(arbSafeKey, arbEncodableString, { minKeys: 1, maxKeys: 5 });

/**
 * Non-empty key made of characters that require percent-encoding (space, `&`,
 * `=`, `?`, `#`, `+`, `/`). `encodeURIComponent` makes these structurally safe,
 * so they must survive the build→parse cycle as keys, not just as values. (#745)
 */
export const arbEncodableKey: fc.Arbitrary<string> = fc.string({
  unit: fc.constantFrom(...ENCODABLE_CHARS),
  minLength: 1,
  maxLength: 8,
});

// Curated multibyte characters (no lone surrogates → encodeURIComponent is safe).
const UNICODE_CHARS = [
  "é",
  "ü",
  "ñ",
  "ß",
  "ç",
  "α",
  "β",
  "д",
  "и",
  "中",
  "文",
  "図",
  "書",
  "🎉",
  "✓",
  "—",
  "…",
];

/**
 * Multibyte string value — verifies the encodeURIComponent/decodeURIComponent
 * roundtrip for non-ASCII content, not just the curated ASCII set.
 */
export const arbUnicodeString: fc.Arbitrary<string> = fc.string({
  unit: fc.constantFrom(...UNICODE_CHARS),
  minLength: 1,
  maxLength: 10,
});

const arbSafeNonEmpty: fc.Arbitrary<string> = fc.string({
  unit: fc.constantFrom(...SAFE_CHARS),
  minLength: 1,
  maxLength: 6,
});

/**
 * A string that may contain literal commas (`"a,b"`). Under `arrayFormat:"comma"`
 * the comma inside a value must be encoded as `%2C` and survive as a literal,
 * distinct from the unencoded `,` element separator. (INVARIANTS Format #3)
 */
export const arbStringWithComma: fc.Arbitrary<string> = fc
  .array(arbSafeNonEmpty, { minLength: 1, maxLength: 3 })
  .map((parts) => parts.join(","));

const arbDigit = fc.constantFrom(
  "0",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
);

/**
 * Numeric-looking strings that are deliberately NOT coerced by `numberFormat:"auto"`:
 * leading zeros (`"007"`), unsafe integers (>2^53), exponent notation, and negative
 * zero (`"-0"`). They must stay strings to preserve their exact text/round-trip.
 * (#742, #898, INVARIANTS #11/#14/#16)
 */
export const arbNonCanonicalNumericString: fc.Arbitrary<string> = fc.oneof(
  // Leading zero: "0" repeated + digits → always starts "0" with length > 1.
  fc
    .tuple(fc.integer({ min: 1, max: 4 }), fc.integer({ min: 0, max: 9999 }))
    .map(([zeros, n]) => "0".repeat(zeros) + String(n)),
  // Unsafe integer: 17–20 digits (≥ 10^16 > Number.MAX_SAFE_INTEGER).
  fc
    .tuple(
      arbDigit.filter((d) => d !== "0"),
      fc.string({ unit: arbDigit, minLength: 16, maxLength: 19 }),
    )
    .map(([first, rest]) => `${first}${rest}`),
  // Exponent notation — never matched by the canonical-number grammar.
  fc.constantFrom("1e5", "2e10", "1E4", "1.5e3", "6e2", "9e9", "1e+5", "1e-3"),
  // Negative zero — a valid number but not round-trippable (build(-0) → "0"). (#898)
  fc.constantFrom("-0", "-0.0", "-0.00"),
);

export const arbQueryPrimitive: fc.Arbitrary<QueryParamPrimitive> = fc.oneof(
  arbSafeString,
  fc.integer({ min: -1000, max: 1000 }),
  fc.double({ noNaN: true, noDefaultInfinity: true }),
  fc.boolean(),
  fc.constant(null),
);

export const arbQueryValue: fc.Arbitrary<QueryParamValue> = fc.oneof(
  arbQueryPrimitive,
  fc.array(
    fc.oneof(
      arbSafeString,
      fc.integer({ min: -1000, max: 1000 }),
      fc.boolean(),
    ),
    { minLength: 2, maxLength: 5 },
  ),
);

export const arbSearchParams: fc.Arbitrary<SearchParams> = fc.dictionary(
  arbSafeKey,
  arbQueryValue,
  { minKeys: 0, maxKeys: 5 },
);

export const arbSearchParamsStrings: fc.Arbitrary<Record<string, string>> =
  fc.dictionary(arbSafeKey, arbSafeString, { minKeys: 0, maxKeys: 5 });

const arbArrayFormat: fc.Arbitrary<ArrayFormat> = fc.constantFrom(
  "none",
  "brackets",
  "index",
  "comma",
);

const arbBooleanFormat: fc.Arbitrary<BooleanFormat> = fc.constantFrom(
  "none",
  "auto",
  "empty-true",
);

const arbNullFormat: fc.Arbitrary<NullFormat> = fc.constantFrom(
  "default",
  "hidden",
);

const arbNumberFormat: fc.Arbitrary<NumberFormat> = fc.constantFrom(
  "none",
  "auto",
);

export const arbOptions: fc.Arbitrary<Options> = fc.record({
  arrayFormat: arbArrayFormat,
  booleanFormat: arbBooleanFormat,
  nullFormat: arbNullFormat,
  numberFormat: arbNumberFormat,
});

/**
 * Options that apply no scalar coercion: both `numberFormat` and `booleanFormat`
 * are pinned to `none`. Required for exact string-roundtrip tests — otherwise a
 * generated value of `"123"` (numberFormat auto) or `"true"`/`"false"`
 * (booleanFormat auto/empty-true) would coerce and break exact equality, a leak
 * that previously passed only because such tokens are rarely generated. (#746)
 */
export const arbOptionsStringSafe: fc.Arbitrary<Options> = fc.record({
  arrayFormat: arbArrayFormat,
  booleanFormat: fc.constant("none"),
  nullFormat: arbNullFormat,
  numberFormat: fc.constant("none"),
});

export const arbQueryStringWithOpts: fc.Arbitrary<[string, Options]> = fc
  .tuple(arbSearchParams, arbOptions)
  .map(([params, opts]) => [
    build(params as Record<string, unknown>, opts),
    opts,
  ]);

export const arbQueryString: fc.Arbitrary<string> = fc
  .tuple(arbSearchParamsStrings, arbOptions)
  .map(([params, opts]) => build(params, opts));

/**
 * Contract oracle for `numberFormat: "auto"` — deliberately expressed as a
 * declarative grammar, NOT a copy of `autoNumberStrategy.decode()`'s scan loop,
 * so a mutation in the implementation cannot be silently mirrored here (#746).
 *
 * Contract: `auto` coerces a *canonical decimal number* to `Number`:
 * - optional leading `-` (negatives round-trip with build/navigate, #742)
 * - integer part is `0` or a non-zero-leading digit run (no `"007"`, no `"-007"`)
 * - optional fractional part with at least one digit after the point
 * - no exponent notation
 * - integers must be safe (decimals are accepted as-is — precision is the caller's)
 * Anything else stays a string.
 */
const CANONICAL_NUMBER = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;

function isAutoNumber(str: string): boolean {
  const isCanonical = CANONICAL_NUMBER.test(str);

  // Unsafe integers (no fractional part) lose precision through Number() — kept as strings.
  const isSafeMagnitude =
    str.includes(".") || Number.isSafeInteger(Number(str));

  return isCanonical && isSafeMagnitude;
}

function normalizeNumber(value: number, numFmt: NumberFormat): number | string {
  if (numFmt === "auto") {
    const str = String(value);

    // -0 loses sign through URL roundtrip: String(-0) → "0" → Number("0") → +0
    return isAutoNumber(str) ? Number(str) : str;
  }

  return String(value);
}

/**
 * Converts a string to number if it matches the auto-number pattern.
 * After build→parse, a string like "8" becomes the URL value "8",
 * which numberFormat: "auto" parses back as number 8.
 */
function maybeParseAutoNumber(
  value: string,
  numFmt: NumberFormat,
): string | number {
  return numFmt === "auto" && isAutoNumber(value) ? Number(value) : value;
}

/**
 * Models how `decode` coerces a *string* value: the boolean strategy's
 * `decodeRaw` runs first (so `"true"`/`"false"` become booleans under `auto` and
 * `empty-true`), then the number strategy. Mirrors the decode order in
 * `decode.ts`, so a string literal like `"true"` round-trips to `true` — not the
 * string — under coercing boolean formats. (#746)
 */
function normalizeStringValue(
  value: string,
  boolFmt: BooleanFormat,
  numFmt: NumberFormat,
): QueryParamPrimitive {
  if (boolFmt === "auto" || boolFmt === "empty-true") {
    if (value === "true") {
      return true;
    }
    if (value === "false") {
      return false;
    }
  }

  return maybeParseAutoNumber(value, numFmt);
}

function normalizePrimitive(
  value: QueryParamPrimitive,
  boolFmt: BooleanFormat,
  numFmt: NumberFormat,
): QueryParamPrimitive {
  if (value === null) {
    return null;
  }
  if (typeof value === "number") {
    return normalizeNumber(value, numFmt);
  }
  if (typeof value === "boolean") {
    switch (boolFmt) {
      case "auto": {
        return value;
      }
      case "empty-true": {
        // true → key-only (?flag), false → ?flag=false; both decode back to boolean
        return value;
      }
      default: {
        return maybeParseAutoNumber(String(value), numFmt);
      }
    }
  }

  return normalizeStringValue(value, boolFmt, numFmt);
}

function normalizeArrayElement(
  value: QueryParamPrimitive,
  boolFmt: BooleanFormat,
  numFmt: NumberFormat,
): QueryParamPrimitive {
  if (value === null) {
    return null;
  }
  if (typeof value === "number") {
    return normalizeNumber(value, numFmt);
  }
  if (typeof value === "boolean") {
    // "auto" and "empty-true" both preserve the boolean type ("empty-true"
    // decodes a "false" element back to false); "none" stringifies it.
    return boolFmt === "auto" || boolFmt === "empty-true"
      ? value
      : maybeParseAutoNumber(String(value), numFmt);
  }

  return normalizeStringValue(value, boolFmt, numFmt);
}

function normalizeValue(
  key: string,
  value: QueryParamValue,
  boolFmt: BooleanFormat,
  nullFmt: NullFormat,
  _arrFmt: ArrayFormat,
  numFmt: NumberFormat,
  result: Record<string, unknown>,
): void {
  if (value === null) {
    // Contract oracle, NOT a mirror of the implementation: a faithful nullFormat
    // round-trips null back to null. The `empty-true` exception (null collapses to
    // the bare-key `true` token — INVARIANTS #18) is a documented, deterministic
    // loss, so it is *excluded* from the roundtrip property (see the `fc.pre` guard
    // in parseBuild.properties.ts) and asserted explicitly in formats.properties.ts
    // — never silently absorbed here, which would mask future null-handling regressions.
    if (nullFmt !== "hidden") {
      result[key] = null;
    }

    return;
  }

  if (Array.isArray(value)) {
    result[key] = value.map((element) =>
      normalizeArrayElement(element, boolFmt, numFmt),
    );

    return;
  }

  result[key] = normalizePrimitive(value, boolFmt, numFmt);
}

export function normalizeForComparison(
  params: SearchParams,
  opts: Options,
): Record<string, unknown> {
  const boolFmt = opts.booleanFormat ?? "auto";
  const nullFmt = opts.nullFormat ?? "default";
  const arrFmt = opts.arrayFormat ?? "none";
  const numFmt = opts.numberFormat ?? "auto";
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      normalizeValue(key, value, boolFmt, nullFmt, arrFmt, numFmt, result);
    }
  }

  return result;
}
