import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";

import {
  arbSafeKey,
  arbSafeString,
  arbSearchParamsEncodable,
  NUM_RUNS,
} from "./helpers";
import { build, parse } from "../../src";

import type { ArrayFormat, BooleanFormat } from "../../src";

const arbArrayParamsBracketsOrIndex = fc.tuple(
  fc.dictionary(
    arbSafeKey,
    fc.array(arbSafeString, { minLength: 1, maxLength: 5 }),
    { minKeys: 1, maxKeys: 3 },
  ),
  fc.constantFrom("brackets", "index") as fc.Arbitrary<ArrayFormat>,
);

const arbBoolParams = fc.dictionary(arbSafeKey, fc.boolean(), {
  minKeys: 1,
  maxKeys: 5,
});

const arbNullParams = fc.dictionary(arbSafeKey, fc.constant<null>(null), {
  minKeys: 1,
  maxKeys: 5,
});

const arbBoolFormatForNull = fc.constantFrom(
  "none",
  "string",
) as fc.Arbitrary<BooleanFormat>;

describe("array format roundtrip", () => {
  test.prop([arbArrayParamsBracketsOrIndex], { numRuns: NUM_RUNS.standard })(
    "brackets/index formats: parse(build(params, opts), opts) === params for string arrays",
    ([params, arrayFormat]: [Record<string, string[]>, ArrayFormat]) => {
      const opts = { arrayFormat };
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
    "none format: multi-element string arrays roundtrip correctly",
    (params: Record<string, string[]>) => {
      const opts = { arrayFormat: "none" as ArrayFormat };
      const qs = build(params, opts);
      const parsed = parse(qs, opts);

      expect(parsed).toStrictEqual({ ...params });
    },
  );
});

describe("boolean format roundtrip", () => {
  test.prop([arbBoolParams], { numRuns: NUM_RUNS.standard })(
    "booleanFormat 'string': parse(build(params, opts), opts) === params preserving boolean types",
    (params: Record<string, boolean>) => {
      const opts = { booleanFormat: "string" as BooleanFormat };
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
    fc.constant(null as unknown),
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
      }).not.toThrowError();
    },
  );

  test.prop([arbSafeKey, arbInvalidElement], { numRuns: NUM_RUNS.standard })(
    "invalid elements: null, undefined, objects throw TypeError",
    (key: string, value: unknown) => {
      expect(() => {
        build({ [key]: [value] });
      }).toThrowError(TypeError);
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
      const opts = { arrayFormat: "none" as ArrayFormat };
      const qs = build(params, opts);
      const parsed = parse(qs, opts);

      for (const [key, [value]] of Object.entries(params)) {
        expect(parsed[key]).toBe(value);
        expect(Array.isArray(parsed[key])).toBe(false);
      }
    },
  );
});
