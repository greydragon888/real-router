import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";

import {
  arbSafeKey,
  arbSafeString,
  arbSearchParamsEncodable,
  arbStringWithComma,
  arbNonCanonicalNumericString,
  NUM_RUNS,
} from "./helpers";
import { build, parse } from "../../src";

import type { ArrayFormat, BooleanFormat, NumberFormat } from "../../src";

const STRING_SAFE = { numberFormat: "none", booleanFormat: "none" } as const;

const arbArrayParamsBracketsOrIndex = fc.tuple(
  fc.dictionary(
    arbSafeKey,
    fc.array(arbSafeString, { minLength: 1, maxLength: 5 }),
    { minKeys: 1, maxKeys: 3 },
  ),
  fc.constantFrom("brackets", "index"),
);

const arbBoolParams = fc.dictionary(arbSafeKey, fc.boolean(), {
  minKeys: 1,
  maxKeys: 5,
});

const arbNullParams = fc.dictionary(arbSafeKey, fc.constant(null), {
  minKeys: 1,
  maxKeys: 5,
});

const arbBoolFormatForNull = fc.constantFrom(
  "none",
  "auto",
) as fc.Arbitrary<BooleanFormat>;

describe("array format roundtrip", () => {
  test.prop([arbArrayParamsBracketsOrIndex], { numRuns: NUM_RUNS.standard })(
    "brackets/index formats: parse(build(params, opts), opts) === params for string arrays",
    ([params, arrayFormat]: [Record<string, string[]>, ArrayFormat]) => {
      const opts = { arrayFormat, numberFormat: "none" as NumberFormat };
      const qs = build(params, opts);
      const parsed = parse(qs, opts);

      expect(parsed).toStrictEqual({ ...params });
    },
  );

  test.prop([fc.array(arbSafeString, { minLength: 2, maxLength: 6 })], {
    numRuns: NUM_RUNS.standard,
  })(
    "index format: out-of-order indexed chunks parse back in index order",
    (values: string[]) => {
      // Emit a[i]=v in REVERSED order; parse must sort by the bracket index and
      // recover the original array (not insertion order). (#856)
      const opts = {
        arrayFormat: "index" as ArrayFormat,
        numberFormat: "none" as NumberFormat,
      };
      const reversed = values
        .map((v, i) => `a[${i}]=${encodeURIComponent(v)}`)
        .toReversed()
        .join("&");

      expect(parse(reversed, opts)).toStrictEqual({ a: values });
    },
  );

  test.prop(
    [
      fc.dictionary(
        arbSafeKey,
        fc.array(arbSafeString, { minLength: 2, maxLength: 5 }),
        { minKeys: 1, maxKeys: 3 },
      ),
    ],
    { numRuns: NUM_RUNS.standard },
  )(
    "none format: multi-element string arrays roundtrip correctly",
    (params: Record<string, string[]>) => {
      const opts = {
        arrayFormat: "none" as ArrayFormat,
        numberFormat: "none" as NumberFormat,
      };
      const qs = build(params, opts);
      const parsed = parse(qs, opts);

      expect(parsed).toStrictEqual({ ...params });
    },
  );

  test.prop(
    [
      fc.dictionary(
        arbSafeKey,
        fc.array(arbSafeString, { minLength: 2, maxLength: 5 }),
        { minKeys: 1, maxKeys: 3 },
      ),
    ],
    { numRuns: NUM_RUNS.standard },
  )(
    "comma format: multi-element string arrays roundtrip correctly",
    (params: Record<string, string[]>) => {
      const opts = {
        arrayFormat: "comma" as ArrayFormat,
        numberFormat: "none" as NumberFormat,
      };
      const qs = build(params, opts);
      const parsed = parse(qs, opts);

      expect(parsed).toStrictEqual({ ...params });
    },
  );

  test.prop(
    [
      fc.dictionary(
        arbSafeKey,
        fc.array(arbStringWithComma, { minLength: 2, maxLength: 4 }),
        { minKeys: 1, maxKeys: 3 },
      ),
    ],
    { numRuns: NUM_RUNS.standard },
  )(
    "comma format: values containing commas survive via %2C (encoded comma stays literal)",
    (params: Record<string, string[]>) => {
      // Inner commas are encoded as %2C and must round-trip as literal commas,
      // distinct from the unencoded ',' element separator. (INVARIANTS Format #3)
      const opts = { arrayFormat: "comma" as ArrayFormat, ...STRING_SAFE };
      const qs = build(params, opts);
      const parsed = parse(qs, opts);

      expect(parsed).toStrictEqual({ ...params });
    },
  );
});

describe("boolean format roundtrip", () => {
  test.prop([arbBoolParams], { numRuns: NUM_RUNS.standard })(
    "booleanFormat 'auto': parse(build(params, opts), opts) === params preserving boolean types",
    (params: Record<string, boolean>) => {
      const opts = { booleanFormat: "auto" as BooleanFormat };
      const qs = build(params, opts);
      const parsed = parse(qs, opts);

      expect(parsed).toStrictEqual({ ...params });
    },
  );

  test.prop(
    [fc.dictionary(arbSafeKey, fc.boolean(), { minKeys: 1, maxKeys: 5 })],
    {
      numRuns: NUM_RUNS.standard,
    },
  )(
    "booleanFormat 'empty-true': true values roundtrip correctly (key-only encoding)",
    (params: Record<string, boolean>) => {
      const trueOnly = Object.fromEntries(
        Object.entries(params).filter(([, v]) => v),
      );

      fc.pre(Object.keys(trueOnly).length > 0);

      const opts = { booleanFormat: "empty-true" as BooleanFormat };
      const qs = build(trueOnly, opts);
      const parsed = parse(qs, opts);

      expect(parsed).toStrictEqual(trueOnly);
    },
  );

  test.prop(
    [fc.dictionary(arbSafeKey, fc.boolean(), { minKeys: 1, maxKeys: 5 })],
    {
      numRuns: NUM_RUNS.standard,
    },
  )(
    "booleanFormat 'empty-true': both true and false roundtrip preserving boolean type",
    (params: Record<string, boolean>) => {
      const opts = { booleanFormat: "empty-true" as BooleanFormat };
      const qs = build(params, opts);
      const parsed = parse(qs, opts);

      expect(parsed).toStrictEqual({ ...params });
    },
  );
});

describe("null format roundtrip", () => {
  test.prop([arbNullParams, arbBoolFormatForNull], {
    numRuns: NUM_RUNS.standard,
  })(
    "nullFormat 'default': parse(build(params, opts), opts) === params preserving null",
    (params: Record<string, null>, booleanFormat: BooleanFormat) => {
      const opts = { nullFormat: "default" as const, booleanFormat };
      const qs = build(params, opts);
      const parsed = parse(qs, opts);

      expect(parsed).toStrictEqual({ ...params });
    },
  );

  test.prop([arbNullParams], { numRuns: NUM_RUNS.standard })(
    "nullFormat 'hidden': null values are omitted from the query string entirely",
    (params: Record<string, null>) => {
      const opts = { nullFormat: "hidden" as const };
      const qs = build(params, opts);

      expect(qs).toBe("");
      expect(parse(qs, opts)).toStrictEqual({});
    },
  );
});

describe("number format roundtrip", () => {
  const arbNatParams = fc.dictionary(arbSafeKey, fc.nat({ max: 99_999 }), {
    minKeys: 1,
    maxKeys: 5,
  });

  test.prop([arbNatParams], { numRuns: NUM_RUNS.standard })(
    "numberFormat 'auto': parse(build(params, opts), opts) === params for non-negative integers",
    (params: Record<string, number>) => {
      const opts = { numberFormat: "auto" as NumberFormat };
      const qs = build(params, opts);
      const parsed = parse(qs, opts);

      expect(parsed).toStrictEqual({ ...params });
    },
  );

  const arbDecimalParams = fc.dictionary(
    arbSafeKey,
    fc
      .tuple(fc.nat({ max: 9999 }), fc.integer({ min: 1, max: 99 }))
      .map(([int, frac]) => Number(`${int}.${frac}`)),
    { minKeys: 1, maxKeys: 5 },
  );

  test.prop([arbDecimalParams], { numRuns: NUM_RUNS.standard })(
    "numberFormat 'auto': parse(build(params, opts), opts) === params for decimals",
    (params: Record<string, number>) => {
      const opts = { numberFormat: "auto" as NumberFormat };
      const qs = build(params, opts);
      const parsed = parse(qs, opts);

      expect(parsed).toStrictEqual({ ...params });
    },
  );

  const arbNegativeParams = fc.dictionary(
    arbSafeKey,
    fc.integer({ min: -99_999, max: -1 }),
    { minKeys: 1, maxKeys: 5 },
  );

  test.prop([arbNegativeParams], { numRuns: NUM_RUNS.standard })(
    "numberFormat 'auto': parse(build(params, opts), opts) === params for negative integers",
    (params: Record<string, number>) => {
      const opts = { numberFormat: "auto" as NumberFormat };
      const qs = build(params, opts);
      const parsed = parse(qs, opts);

      expect(parsed).toStrictEqual({ ...params });
    },
  );

  test.prop([arbNatParams], { numRuns: NUM_RUNS.standard })(
    "numberFormat 'none': numbers become strings after roundtrip",
    (params: Record<string, number>) => {
      const opts = { numberFormat: "none" as NumberFormat };
      const qs = build(params, opts);
      const parsed = parse(qs, opts);

      for (const key of Object.keys(params)) {
        expect(typeof parsed[key]).toBe("string");
      }
    },
  );

  test.prop([arbSafeKey, arbNonCanonicalNumericString], {
    numRuns: NUM_RUNS.standard,
  })(
    "numberFormat 'auto': non-canonical numeric strings (leading-zero/unsafe/exponent) stay strings",
    (key: string, value: string) => {
      // Build the value as a string (numberFormat none), then parse under auto:
      // the narrowing must keep "007"/unsafe-int/"1e5" as their exact text. (#742)
      const qs = build({ [key]: value }, { numberFormat: "none" });
      const parsed = parse(qs, { numberFormat: "auto" });

      expect(parsed[key]).toBe(value);
      expect(typeof parsed[key]).toBe("string");
    },
  );
});

// ===================================================================
// decoding equivalence
// ===================================================================

describe("decoding equivalence", () => {
  test.prop([arbSearchParamsEncodable], { numRuns: NUM_RUNS.standard })(
    "plus-as-space: parse treats + as space equivalently to %20",
    (params: Record<string, string>) => {
      const qs = build(params);
      const qsWithPlus = qs.replaceAll("%20", "+");

      expect(parse(qsWithPlus)).toStrictEqual(parse(qs));
    },
  );
});

// ===================================================================
// ===================================================================

describe("array element validation", () => {
  const arbValidElement = fc.oneof(
    arbSafeString,
    fc.integer({ min: -1000, max: 1000 }),
    fc.boolean(),
  );

  const arbInvalidElement = fc.oneof(
    fc.constant(null),
    fc.constant(undefined as unknown),
    fc.record({ key: arbSafeString }) as fc.Arbitrary<unknown>,
  );

  test.prop(
    [arbSafeKey, fc.array(arbValidElement, { minLength: 1, maxLength: 5 })],
    { numRuns: NUM_RUNS.standard },
  )(
    "valid elements: string | number | boolean are accepted",
    (key: string, values: (string | number | boolean)[]) => {
      expect(() => {
        build({ [key]: values });
      }).not.toThrow();
    },
  );

  test.prop([arbSafeKey, arbInvalidElement], { numRuns: NUM_RUNS.standard })(
    "invalid elements: null, undefined, objects throw TypeError",
    (key: string, value: unknown) => {
      expect(() => {
        build({ [key]: [value] });
      }).toThrow(TypeError);
    },
  );
});

// ===================================================================
// ===================================================================

describe("single-element array asymmetry", () => {
  test.prop(
    [
      fc.dictionary(arbSafeKey, fc.tuple(arbSafeString), {
        minKeys: 1,
        maxKeys: 3,
      }),
    ],
    { numRuns: NUM_RUNS.standard },
  )(
    "none format: single-element arrays collapse to scalars after roundtrip",
    (params: Record<string, [string]>) => {
      const opts = {
        arrayFormat: "none" as ArrayFormat,
        numberFormat: "none" as NumberFormat,
      };
      const qs = build(params, opts);
      const parsed = parse(qs, opts);

      for (const [key, [value]] of Object.entries(params)) {
        expect(parsed[key]).toBe(value);
        expect(Array.isArray(parsed[key])).toBe(false);
      }
    },
  );
});
