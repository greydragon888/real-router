import { fc } from "@fast-check/vitest";

import { build } from "../../src";

import type {
  ArrayFormat,
  BooleanFormat,
  NullFormat,
  NumberFormat,
  Options,
  QueryParamPrimitive,
  QueryParamValue,
  SearchParams,
} from "../../src";

export const NUM_RUNS = {
  standard: 100,
  lifecycle: 50,
  async: 30,
} as const;

// eslint-disable-next-line @typescript-eslint/no-misused-spread -- ASCII-only chars, no emoji risk
const KEY_CHARS = [..."abcdefghijklmnopqrstuvwxyz0123456789"];

export const arbSafeKey: fc.Arbitrary<string> = fc.string({
  unit: fc.constantFrom(...KEY_CHARS),
  minLength: 1,
  maxLength: 8,
});

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
) as fc.Arbitrary<SearchParams>;

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

export const arbOptionsNoAutoNumber: fc.Arbitrary<Options> = fc.record({
  arrayFormat: arbArrayFormat,
  booleanFormat: arbBooleanFormat,
  nullFormat: arbNullFormat,
  numberFormat: fc.constant("none" as NumberFormat),
});

export const arbOptionsNonComma: fc.Arbitrary<Options> = fc.record({
  arrayFormat: fc.constantFrom(
    "none",
    "brackets",
    "index",
  ) as fc.Arbitrary<ArrayFormat>,
  booleanFormat: arbBooleanFormat,
  nullFormat: arbNullFormat,
  numberFormat: arbNumberFormat,
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

const AUTO_NUMBER_RE = /^\d+(\.\d+)?$/;

function normalizeNumber(value: number, numFmt: NumberFormat): number | string {
  if (numFmt === "auto") {
    const str = String(value);

    return AUTO_NUMBER_RE.test(str) ? value : str;
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
  return numFmt === "auto" && AUTO_NUMBER_RE.test(value)
    ? Number(value)
    : value;
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
        return value ? true : "false";
      }
      default: {
        return maybeParseAutoNumber(String(value), numFmt);
      }
    }
  }

  return maybeParseAutoNumber(value, numFmt);
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
    return boolFmt === "auto"
      ? value
      : maybeParseAutoNumber(String(value), numFmt);
  }

  return maybeParseAutoNumber(value, numFmt);
}

function normalizeValue(
  key: string,
  value: QueryParamValue,
  boolFmt: BooleanFormat,
  nullFmt: NullFormat,
  arrFmt: ArrayFormat,
  numFmt: NumberFormat,
  result: Record<string, unknown>,
): void {
  if (value === null) {
    if (nullFmt !== "hidden") {
      result[key] = boolFmt === "empty-true" ? true : null;
    }

    return;
  }

  if (Array.isArray(value)) {
    if (arrFmt !== "comma") {
      result[key] = value.map((element) =>
        normalizeArrayElement(element, boolFmt, numFmt),
      );
    }

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
