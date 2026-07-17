import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";

import {
  arbSafeKey,
  arbSafeString,
  arbSearchParamsEncodable,
  arbStringWithComma,
  arbNonCanonicalNumericString,
  erasesEmptyKey,
  NUM_RUNS,
} from "./helpers";
import { build, parseQuery } from "../../../src/search-params";

import type {
  ArrayFormat,
  BooleanFormat,
  NumberFormat,
} from "../../../src/search-params";

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

// empty-true is intentionally excluded: it reserves the bare-key form for `true`,
// so null is not representable and would round-trip to `true` (INVARIANTS #18) —
// that documented loss is asserted in its own test below, not here.
const arbBoolFormatForNull = fc.constantFrom(
  "none",
  "auto",
) as fc.Arbitrary<BooleanFormat>;

describe("array format roundtrip", () => {
  test.prop([arbArrayParamsBracketsOrIndex], { numRuns: NUM_RUNS.standard })(
    "brackets/index formats: parseQuery(build(params, opts), opts) === params for string arrays",
    ([params, arrayFormat]: [Record<string, string[]>, ArrayFormat]) => {
      const opts = { arrayFormat, numberFormat: "none" as NumberFormat };
      const qs = build(params, opts);
      const parsed = parseQuery(qs, opts);

      expect(parsed).toStrictEqual({ ...params });
    },
  );

  test.prop([fc.array(arbSafeString, { minLength: 2, maxLength: 6 })], {
    numRuns: NUM_RUNS.standard,
  })(
    "index format: out-of-order indexed chunks parseQuery back in index order",
    (values: string[]) => {
      // Emit a[i]=v in REVERSED order; parseQuery must sort by the bracket index and
      // recover the original array (not insertion order). (#856)
      const opts = {
        arrayFormat: "index" as ArrayFormat,
        numberFormat: "none" as NumberFormat,
      };
      const reversed = values
        .map((v, i) => `a[${i}]=${encodeURIComponent(v)}`)
        .toReversed()
        .join("&");

      expect(parseQuery(reversed, opts)).toStrictEqual({ a: values });
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
      const parsed = parseQuery(qs, opts);

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
      const parsed = parseQuery(qs, opts);

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
      const parsed = parseQuery(qs, opts);

      expect(parsed).toStrictEqual({ ...params });
    },
  );
});

describe("boolean format roundtrip", () => {
  test.prop([arbBoolParams], { numRuns: NUM_RUNS.standard })(
    "booleanFormat 'auto': parseQuery(build(params, opts), opts) === params preserving boolean types",
    (params: Record<string, boolean>) => {
      const opts = { booleanFormat: "auto" as BooleanFormat };
      const qs = build(params, opts);
      const parsed = parseQuery(qs, opts);

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
      // "" + true under empty-true is a documented loss (#1051, erasesEmptyKey)
      // — asserted in the dedicated test below, excluded from this round-trip.
      fc.pre(!erasesEmptyKey(trueOnly, { booleanFormat: "empty-true" }));

      const opts = { booleanFormat: "empty-true" as BooleanFormat };
      const qs = build(trueOnly, opts);
      const parsed = parseQuery(qs, opts);

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
      // "" + true under empty-true is a documented loss (#1051); "" + false
      // round-trips (`=false`), so only the true case is excluded.
      fc.pre(!erasesEmptyKey(params, { booleanFormat: "empty-true" }));

      const opts = { booleanFormat: "empty-true" as BooleanFormat };
      const qs = build(params, opts);
      const parsed = parseQuery(qs, opts);

      expect(parsed).toStrictEqual({ ...params });
    },
  );
});

describe("null format roundtrip", () => {
  test.prop([arbNullParams, arbBoolFormatForNull], {
    numRuns: NUM_RUNS.standard,
  })(
    "nullFormat 'default': parseQuery(build(params, opts), opts) === params preserving null",
    (params: Record<string, null>, booleanFormat: BooleanFormat) => {
      const opts = { nullFormat: "default" as const, booleanFormat };

      // "" + null under nullFormat default is a documented loss (#1051): the
      // bare-key token is "", dropped by build. Asserted in the dedicated test.
      fc.pre(!erasesEmptyKey(params, opts));

      const qs = build(params, opts);
      const parsed = parseQuery(qs, opts);

      expect(parsed).toStrictEqual({ ...params });
    },
  );

  test.prop([arbNullParams], { numRuns: NUM_RUNS.standard })(
    "nullFormat 'hidden': null values are omitted from the query string entirely",
    (params: Record<string, null>) => {
      const opts = { nullFormat: "hidden" as const };
      const qs = build(params, opts);

      expect(qs).toBe("");
      expect(parseQuery(qs, opts)).toStrictEqual({});
    },
  );

  // INVARIANTS #18: under empty-true the bare-key form `?key` is reserved for
  // `true`, so a null value (nullFormat default) is NOT representable — it shares
  // the wire form with `true` and decodes back as `true`. This documents the
  // deterministic loss explicitly instead of letting the roundtrip oracle absorb
  // the asymmetry (the leak the `helpers.ts` honest-oracle + `fc.pre` removes). (1.A)
  test.prop([arbSafeKey], { numRuns: NUM_RUNS.standard })(
    "nullFormat 'default' + empty-true: null is not representable — encodes to a bare key and decodes to true",
    (key: string) => {
      // The collapse (null and true share the bare-key token, null decodes back
      // as true) only applies to a NON-empty key. For "" the token is "" itself,
      // which build drops entirely — an erasure, not a collapse (#1051, asserted
      // in the dedicated test below).
      fc.pre(key !== "");

      const opts = { booleanFormat: "empty-true" as BooleanFormat };
      const qs = build({ [key]: null }, opts);

      expect(qs).toBe(key); // null and true collapse to the same bare-key token
      expect(parseQuery(qs, opts)).toStrictEqual({ [key]: true });
    },
  );

  // #1051: the empty-string key "" is erased whenever its value encodes to a
  // bare-key token (no `=`) — that token is "" itself, which build's empty-chunk
  // filter drops, so there is no wire form to round-trip it. Documents the loss
  // explicitly (the combos erasesEmptyKey excludes from the properties above),
  // the empty-key sibling of the null+empty-true collapse (#18).
  test("empty key carrying a bare-key value is erased (documented loss, #1051)", () => {
    // true under empty-true → bare key → "" → dropped
    expect(build({ "": true }, { booleanFormat: "empty-true" })).toBe("");
    expect(parseQuery("", { booleanFormat: "empty-true" })).toStrictEqual({});

    // null under nullFormat default → bare key → "" → dropped
    expect(build({ "": null }, { nullFormat: "default" })).toBe("");
    expect(parseQuery("", { nullFormat: "default" })).toStrictEqual({});

    // contrast: the SAME values round-trip under a non-empty key, and the empty
    // key round-trips for non-bare values (`=false` / `=x` keep the chunk).
    expect(
      parseQuery(build({ k: true }, { booleanFormat: "empty-true" }), {
        booleanFormat: "empty-true",
      }),
    ).toStrictEqual({ k: true });
    expect(
      parseQuery(build({ "": false }, { booleanFormat: "empty-true" }), {
        booleanFormat: "empty-true",
      }),
    ).toStrictEqual({ "": false });
  });
});

describe("number format roundtrip", () => {
  const arbNatParams = fc.dictionary(arbSafeKey, fc.nat({ max: 99_999 }), {
    minKeys: 1,
    maxKeys: 5,
  });

  test.prop([arbNatParams], { numRuns: NUM_RUNS.standard })(
    "numberFormat 'auto': parseQuery(build(params, opts), opts) === params for non-negative integers",
    (params: Record<string, number>) => {
      const opts = { numberFormat: "auto" as NumberFormat };
      const qs = build(params, opts);
      const parsed = parseQuery(qs, opts);

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
    "numberFormat 'auto': parseQuery(build(params, opts), opts) === params for decimals",
    (params: Record<string, number>) => {
      const opts = { numberFormat: "auto" as NumberFormat };
      const qs = build(params, opts);
      const parsed = parseQuery(qs, opts);

      expect(parsed).toStrictEqual({ ...params });
    },
  );

  const arbNegativeParams = fc.dictionary(
    arbSafeKey,
    fc.integer({ min: -99_999, max: -1 }),
    { minKeys: 1, maxKeys: 5 },
  );

  test.prop([arbNegativeParams], { numRuns: NUM_RUNS.standard })(
    "numberFormat 'auto': parseQuery(build(params, opts), opts) === params for negative integers",
    (params: Record<string, number>) => {
      const opts = { numberFormat: "auto" as NumberFormat };
      const qs = build(params, opts);
      const parsed = parseQuery(qs, opts);

      expect(parsed).toStrictEqual({ ...params });
    },
  );

  test.prop([arbNatParams], { numRuns: NUM_RUNS.standard })(
    "numberFormat 'none': numbers become strings after roundtrip",
    (params: Record<string, number>) => {
      const opts = { numberFormat: "none" as NumberFormat };
      const qs = build(params, opts);
      const parsed = parseQuery(qs, opts);

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
      // Build the value as a string (numberFormat none), then parseQuery under auto:
      // the narrowing must keep "007"/unsafe-int/"1e5" as their exact text. (#742)
      const qs = build({ [key]: value }, { numberFormat: "none" });
      const parsed = parseQuery(qs, { numberFormat: "auto" });

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
    "plus-as-space: parseQuery treats + as space equivalently to %20",
    (params: Record<string, string>) => {
      const qs = build(params);
      const qsWithPlus = qs.replaceAll("%20", "+");

      expect(parseQuery(qsWithPlus)).toStrictEqual(parseQuery(qs));
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

  // `null` was moved OUT of the invalid set (#1155): a null array element now
  // encodes to the format's bare-key form (round-trippable), so it no longer
  // throws — covered by the inverse-pair totality property. `undefined` and
  // objects remain unserialisable.
  const arbInvalidElement = fc.oneof(
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
    "invalid elements: undefined, objects throw TypeError",
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
      const parsed = parseQuery(qs, opts);

      for (const [key, [value]] of Object.entries(params)) {
        expect(parsed[key]).toBe(value);
        expect(Array.isArray(parsed[key])).toBe(false);
      }
    },
  );
});
