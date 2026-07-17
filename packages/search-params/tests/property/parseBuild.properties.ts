import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  arbSearchParams,
  arbSearchParamsStrings,
  arbSearchParamsEncodable,
  arbOptions,
  arbOptionsStringSafe,
  arbSafeKey,
  arbSafeString,
  arbEncodableKey,
  arbUnicodeString,
  erasesEmptyKey,
  normalizeForComparison,
  NUM_RUNS,
} from "./helpers";
import { build, parseQuery } from "../../src";

import type { BooleanFormat, Options, SearchParams } from "../../src";

const STRING_SAFE = { numberFormat: "none", booleanFormat: "none" } as const;

describe("parseQuery/build roundtrip", () => {
  test.prop([arbSearchParamsStrings, arbOptionsStringSafe], {
    numRuns: NUM_RUNS.standard,
  })(
    "roundtrip: parseQuery(build(params, opts), opts) === params for string-only values",
    (params: Record<string, string>, opts: Options) => {
      const qs = build(params, opts);
      const parsed = parseQuery(qs, opts);

      expect(parsed).toStrictEqual({ ...params });
    },
  );

  test.prop([arbSearchParams, arbOptions], {
    numRuns: NUM_RUNS.standard,
  })(
    "roundtrip with type normalization: parseQuery(build(params, opts), opts) ≈ normalizeForComparison(params, opts)",
    (params: SearchParams, opts: Options) => {
      // `null` is not representable under empty-true: the bare-key `?key` form is
      // reserved for `true`, so null collapses to `true` (a documented loss —
      // INVARIANTS #18, asserted explicitly in formats.properties.ts). Exclude it
      // here so the oracle stays an honest contract instead of mirroring the
      // asymmetry to stay green.
      fc.pre(
        opts.booleanFormat !== "empty-true" ||
          !Object.values(params).includes(null),
      );

      // The empty-string key "" is erased when its value encodes to a bare-key
      // token (true under empty-true, null under nullFormat default): that token
      // is "" itself, dropped by build's empty-chunk filter (#1051). A documented
      // loss, asserted explicitly in formats.properties.ts — exclude it here so
      // the oracle stays an honest contract.
      fc.pre(!erasesEmptyKey(params, opts));

      const qs = build(params, opts);
      const parsed = parseQuery(qs, opts);
      const expected = normalizeForComparison(params, opts);

      expect(parsed).toStrictEqual(expected);
    },
  );

  // No options ⇒ build and parseQuery share the cached auto defaults, so the roundtrip
  // holds without passing options at all. Guards the #744 symmetry generatively
  // (previously only a single hardcoded example existed).
  test.prop([arbSearchParams], { numRuns: NUM_RUNS.standard })(
    "no-options roundtrip: parseQuery(build(params)) ≈ normalizeForComparison(params, {}) (auto defaults)",
    (params: SearchParams) => {
      // No-options build uses auto defaults (nullFormat "default"), so the empty
      // key carrying null is erased here too (#1051) — exclude it (the loss is
      // asserted in formats.properties.ts).
      fc.pre(!erasesEmptyKey(params, {}));

      const qs = build(params);
      const parsed = parseQuery(qs);
      const expected = normalizeForComparison(params, {});

      expect(parsed).toStrictEqual(expected);
    },
  );

  // Oracle parity for string tokens: a string value of "true"/"false" is coerced
  // to a boolean by decodeRaw under auto/empty-true. Deterministic regression for
  // the oracle fix — fails if normalizeForComparison stops modelling this. (#746)
  test.prop(
    [fc.constantFrom("auto", "empty-true"), fc.constantFrom("true", "false")],
    {
      numRuns: NUM_RUNS.standard,
    },
  )(
    "string boolean tokens coerce under auto/empty-true (oracle parity)",
    (booleanFormat: BooleanFormat, token: string) => {
      const opts = { booleanFormat };
      const parsed = parseQuery(build({ k: token }, opts), opts);

      expect(parsed).toStrictEqual(normalizeForComparison({ k: token }, opts));
      expect(parsed.k).toBe(token === "true");
    },
  );
});

describe("stability", () => {
  test.prop([arbSearchParams, arbOptions], {
    numRuns: NUM_RUNS.standard,
  })(
    "stability: parseQuery(build(parseQuery(build(p)), opts)) ≡ parseQuery(build(p, opts))",
    (params: SearchParams, opts: Options) => {
      const qs1 = build(params, opts);
      const parsed1 = parseQuery(qs1, opts);
      const qs2 = build(parsed1, opts);
      const parsed2 = parseQuery(qs2, opts);

      expect(parsed2).toStrictEqual(parsed1);
    },
  );
});

describe("determinism", () => {
  test.prop([arbSearchParams, arbOptions], { numRuns: NUM_RUNS.standard })(
    "determinism: build(params, opts) === build(params, opts) for two calls with same input",
    (params: SearchParams, opts: Options) => {
      const qs1 = build(params, opts);
      const qs2 = build(params, opts);

      expect(qs1).toBe(qs2);
    },
  );
});

describe("acceptance of boundary values", () => {
  it("parseQuery('') returns {}", () => {
    expect(parseQuery("")).toStrictEqual({});
  });

  it("parseQuery('?') returns {}", () => {
    expect(parseQuery("?")).toStrictEqual({});
  });

  it("build({}) returns ''", () => {
    expect(build({})).toBe("");
  });
});

describe("build output has no ? prefix", () => {
  test.prop([arbSearchParams, arbOptions], { numRuns: NUM_RUNS.standard })(
    "build never returns a string starting with ?",
    (params: SearchParams, opts: Options) => {
      const qs = build(params, opts);

      expect(qs.startsWith("?")).toBe(false);
    },
  );
});

// ===================================================================
// encode/decode fidelity
// ===================================================================

describe("encode/decode fidelity", () => {
  test.prop([arbSearchParamsEncodable, arbOptionsStringSafe], {
    numRuns: NUM_RUNS.standard,
  })(
    "percent-encoding roundtrip: values with special chars survive build→parseQuery",
    (params: Record<string, string>, opts: Options) => {
      const qs = build(params, opts);
      const parsed = parseQuery(qs, opts);

      expect(parsed).toStrictEqual({ ...params });
    },
  );

  test.prop(
    [fc.dictionary(arbEncodableKey, arbSafeString, { minKeys: 1, maxKeys: 4 })],
    { numRuns: NUM_RUNS.standard },
  )(
    "percent-encoding roundtrip: keys with special chars survive build→parseQuery",
    (params: Record<string, string>) => {
      expect(parseQuery(build(params, STRING_SAFE), STRING_SAFE)).toStrictEqual(
        {
          ...params,
        },
      );
    },
  );

  test.prop(
    [fc.dictionary(arbSafeKey, arbUnicodeString, { minKeys: 1, maxKeys: 4 })],
    { numRuns: NUM_RUNS.standard },
  )(
    "percent-encoding roundtrip: multibyte/unicode values survive build→parseQuery",
    (params: Record<string, string>) => {
      expect(parseQuery(build(params, STRING_SAFE), STRING_SAFE)).toStrictEqual(
        {
          ...params,
        },
      );
    },
  );

  test.prop(
    [
      fc.dictionary(arbSafeKey, fc.option(arbSafeString, { nil: undefined }), {
        minKeys: 3,
        maxKeys: 5,
      }),
      arbOptions,
    ],
    { numRuns: NUM_RUNS.standard },
  )(
    "undefined exclusion: build omits undefined-valued keys",
    (params: Record<string, string | undefined>, opts: Options) => {
      const entries = Object.entries(params);

      fc.pre(
        entries.some(([, v]) => v === undefined) &&
          entries.some(([, v]) => v !== undefined),
      );

      const withoutUndefined = Object.fromEntries(
        entries.filter(([, v]) => v !== undefined),
      );

      expect(build(params as Record<string, unknown>, opts)).toBe(
        build(withoutUndefined, opts),
      );
    },
  );

  test.prop(
    [
      fc.dictionary(arbSafeKey, fc.constant<string[]>([]), {
        minKeys: 1,
        maxKeys: 5,
      }),
      arbOptions,
    ],
    { numRuns: NUM_RUNS.standard },
  )(
    "empty array erasure: empty arrays produce no key in the parsed result",
    (params: Record<string, string[]>, opts: Options) => {
      const qs = build(params, opts);

      expect(qs).toBe("");
      expect(parseQuery(qs, opts)).toStrictEqual({});
    },
  );
});
