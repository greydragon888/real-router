import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  arbSearchParams,
  arbSearchParamsStrings,
  arbSearchParamsEncodable,
  arbOptions,
  arbOptionsNoAutoNumber,
  arbSafeKey,
  arbSafeString,
  normalizeForComparison,
  NUM_RUNS,
} from "./helpers";
import { build, parse } from "../../src";

import type { Options, SearchParams } from "../../src";

describe("parse/build roundtrip", () => {
  test.prop([arbSearchParamsStrings, arbOptionsNoAutoNumber], {
    numRuns: NUM_RUNS.standard,
  })(
    "roundtrip: parse(build(params, opts), opts) === params for string-only values",
    (params: Record<string, string>, opts: Options) => {
      const qs = build(params, opts);
      const parsed = parse(qs, opts);

      expect(parsed).toStrictEqual({ ...params });
    },
  );

  test.prop([arbSearchParams, arbOptions], {
    numRuns: NUM_RUNS.standard,
  })(
    "roundtrip with type normalization: parse(build(params, opts), opts) ≈ normalizeForComparison(params, opts)",
    (params: SearchParams, opts: Options) => {
      const qs = build(params as Record<string, unknown>, opts);
      const parsed = parse(qs, opts);
      const expected = normalizeForComparison(params, opts);

      expect(parsed).toStrictEqual(expected);
    },
  );
});

describe("stability", () => {
  test.prop([arbSearchParams, arbOptions], {
    numRuns: NUM_RUNS.standard,
  })(
    "stability: parse(build(parse(build(p)), opts)) ≡ parse(build(p, opts))",
    (params: SearchParams, opts: Options) => {
      const qs1 = build(params as Record<string, unknown>, opts);
      const parsed1 = parse(qs1, opts);
      const qs2 = build(parsed1, opts);
      const parsed2 = parse(qs2, opts);

      expect(parsed2).toStrictEqual(parsed1);
    },
  );
});

describe("determinism", () => {
  test.prop([arbSearchParams, arbOptions], { numRuns: NUM_RUNS.standard })(
    "determinism: build(params, opts) === build(params, opts) for two calls with same input",
    (params: SearchParams, opts: Options) => {
      const qs1 = build(params as Record<string, unknown>, opts);
      const qs2 = build(params as Record<string, unknown>, opts);

      expect(qs1).toBe(qs2);
    },
  );
});

describe("acceptance of boundary values", () => {
  it("parse('') returns {}", () => {
    expect(parse("")).toStrictEqual({});
  });

  it("parse('?') returns {}", () => {
    expect(parse("?")).toStrictEqual({});
  });

  it("build({}) returns ''", () => {
    expect(build({})).toBe("");
  });
});

describe("build output has no ? prefix", () => {
  test.prop([arbSearchParams, arbOptions], { numRuns: NUM_RUNS.standard })(
    "build never returns a string starting with ?",
    (params: SearchParams, opts: Options) => {
      const qs = build(params as Record<string, unknown>, opts);

      expect(qs.startsWith("?")).toBe(false);
    },
  );
});

// ===================================================================
// encode/decode fidelity
// ===================================================================

describe("encode/decode fidelity", () => {
  test.prop([arbSearchParamsEncodable, arbOptionsNoAutoNumber], {
    numRuns: NUM_RUNS.standard,
  })(
    "percent-encoding roundtrip: values with special chars survive build→parse",
    (params: Record<string, string>, opts: Options) => {
      const qs = build(params, opts);
      const parsed = parse(qs, opts);

      expect(parsed).toStrictEqual({ ...params });
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
      expect(parse(qs, opts)).toStrictEqual({});
    },
  );
});
