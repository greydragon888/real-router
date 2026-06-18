import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  arbSearchParamsStrings,
  arbOptions,
  arbQueryString,
  arbSafeKey,
  arbSafeString,
  NUM_RUNS,
} from "./helpers";
import { build, omit, keep, parse } from "../../src";

import type { ArrayFormat, Options } from "../../src";

const arbParamsWithSubset = fc
  .tuple(arbSearchParamsStrings, arbOptions)
  .chain(([params, opts]) => {
    const allKeys = Object.keys(params);

    return fc.subarray(allKeys).map((keysToOmit) => ({
      qs: build(params, opts),
      opts,
      params,
      keysToOmit,
      allKeys,
    }));
  });

// Array-valued params (multi-chunk for none/brackets/index, single-chunk for
// comma) paired with a random subset of keys to omit.
const arbArrayParamsWithSubset = fc
  .tuple(
    fc.dictionary(
      arbSafeKey,
      fc.array(arbSafeString, { minLength: 2, maxLength: 4 }),
      { minKeys: 1, maxKeys: 4 },
    ),
    fc.constantFrom<ArrayFormat>("none", "brackets", "index", "comma"),
  )
  .chain(([params, arrayFormat]) => {
    const opts: Options = {
      arrayFormat,
      numberFormat: "none",
      booleanFormat: "none",
    };
    const allKeys = Object.keys(params);

    return fc.subarray(allKeys).map((keysToOmit) => ({
      qs: build(params, opts),
      opts,
      allKeys,
      keysToOmit,
    }));
  });

describe("omit/keep partitioning", () => {
  test.prop([arbParamsWithSubset], { numRuns: NUM_RUNS.standard })(
    "partitioning: omitted keys are in removedParams, remaining keys are in querystring",
    ({
      qs,
      opts,
      allKeys,
      keysToOmit,
    }: {
      qs: string;
      opts: Options;
      allKeys: string[];
      keysToOmit: string[];
      params: Record<string, string>;
    }) => {
      const result = omit(qs, keysToOmit, opts);
      const omitSet = new Set(keysToOmit);
      const remaining = parse(result.querystring, opts);
      const removed = result.removedParams;

      for (const key of allKeys) {
        if (omitSet.has(key)) {
          expect(key in removed).toBe(true);
          expect(key in remaining).toBe(false);
        } else {
          expect(key in remaining).toBe(true);
          expect(key in removed).toBe(false);
        }
      }
    },
  );

  test.prop([arbArrayParamsWithSubset], { numRuns: NUM_RUNS.standard })(
    "partitioning holds for array-valued params across all array formats",
    ({
      qs,
      opts,
      allKeys,
      keysToOmit,
    }: {
      qs: string;
      opts: Options;
      allKeys: string[];
      keysToOmit: string[];
    }) => {
      const result = omit(qs, keysToOmit, opts);
      const omitSet = new Set(keysToOmit);
      const remaining = parse(result.querystring, opts);
      const removed = result.removedParams;

      // Every chunk of a multi-chunk (repeated/bracket) key must land on one side.
      for (const key of allKeys) {
        if (omitSet.has(key)) {
          expect(key in removed).toBe(true);
          expect(key in remaining).toBe(false);
        } else {
          expect(key in remaining).toBe(true);
          expect(key in removed).toBe(false);
        }
      }
    },
  );
});

describe("omit idempotency", () => {
  test.prop([arbParamsWithSubset], { numRuns: NUM_RUNS.standard })(
    "idempotency: omit(omit(qs, keys), keys).querystring ≡ omit(qs, keys).querystring",
    ({
      qs,
      opts,
      keysToOmit,
    }: {
      qs: string;
      opts: Options;
      keysToOmit: string[];
    }) => {
      const first = omit(qs, keysToOmit, opts);
      const second = omit(first.querystring, keysToOmit, opts);

      expect(second.querystring).toBe(first.querystring);
    },
  );
});

describe("omit/keep identity", () => {
  test.prop([arbSearchParamsStrings, arbOptions], {
    numRuns: NUM_RUNS.standard,
  })(
    "identity: omit(qs, []).querystring === qs",
    (params: Record<string, string>, opts: Options) => {
      const qs = build(params, opts);
      const result = omit(qs, [], opts);

      expect(result.querystring).toBe(qs);
    },
  );

  test.prop([arbSearchParamsStrings, arbOptions], {
    numRuns: NUM_RUNS.standard,
  })(
    "identity: keep(qs, allKeys).querystring === qs",
    (params: Record<string, string>, opts: Options) => {
      const qs = build(params, opts);
      const allKeys = Object.keys(params);
      const result = keep(qs, allKeys, opts);

      expect(result.querystring).toBe(qs);
    },
  );

  it("omit of empty querystring returns empty querystring", () => {
    const result = omit("", ["any"], {});

    expect(result.querystring).toBe("");
    expect(result.removedParams).toStrictEqual({});
  });

  it("keep of empty querystring returns empty querystring", () => {
    const result = keep("", ["any"], {});

    expect(result.querystring).toBe("");
    expect(result.keptParams).toStrictEqual({});
  });
});

describe("omit complement", () => {
  test.prop([arbParamsWithSubset], { numRuns: NUM_RUNS.standard })(
    "complement: no omitted key appears in the remaining querystring",
    ({
      qs,
      opts,
      keysToOmit,
    }: {
      qs: string;
      opts: Options;
      keysToOmit: string[];
    }) => {
      const result = omit(qs, keysToOmit, opts);
      const remaining = parse(result.querystring, opts);
      const remainingKeys = new Set(Object.keys(remaining));

      for (const key of keysToOmit) {
        expect(remainingKeys.has(key)).toBe(false);
      }
    },
  );

  test.prop([arbParamsWithSubset], { numRuns: NUM_RUNS.standard })(
    "complement: keep(qs, subset).keptParams holds exactly the kept keys, none outside",
    ({
      qs,
      opts,
      allKeys,
      keysToOmit,
    }: {
      qs: string;
      opts: Options;
      allKeys: string[];
      keysToOmit: string[];
    }) => {
      // Reuse the random subset as the keep-list and assert `keptParams` membership
      // tracks it (`has(key) === requested`). The previous version compared against
      // an external key never present in the input, so the assertion held no matter
      // what `keep` returned (tautology) — and `keptParams` went untested. (#746)
      const keepSet = new Set(keysToOmit);
      const keptKeys = new Set(
        Object.keys(keep(qs, keysToOmit, opts).keptParams),
      );

      for (const key of allKeys) {
        expect(keptKeys.has(key)).toBe(keepSet.has(key));
      }
    },
  );
});

// ===================================================================
// omit/keep duality
// ===================================================================

describe("omit/keep duality", () => {
  test.prop([arbParamsWithSubset], { numRuns: NUM_RUNS.standard })(
    "duality: omit(qs, keys) ∪ keep(qs, keys) reconstructs original params",
    ({
      qs,
      opts,
      keysToOmit,
    }: {
      qs: string;
      opts: Options;
      keysToOmit: string[];
    }) => {
      const omitResult = omit(qs, keysToOmit, opts);
      const keepResult = keep(qs, keysToOmit, opts);
      const omitParsed = parse(omitResult.querystring, opts);
      const keepParsed = parse(keepResult.querystring, opts);

      expect({ ...omitParsed, ...keepParsed }).toStrictEqual(parse(qs, opts));
    },
  );
});

// ===================================================================
// prefix and exhaustive
// ===================================================================

describe("prefix and exhaustive", () => {
  test.prop([arbParamsWithSubset], { numRuns: NUM_RUNS.standard })(
    "omit preserves ? prefix: ?-prefixed input → ?-prefixed output (when non-empty)",
    ({
      qs,
      opts,
      keysToOmit,
      allKeys,
    }: {
      qs: string;
      opts: Options;
      keysToOmit: string[];
      allKeys: string[];
    }) => {
      fc.pre(qs !== "" && keysToOmit.length < allKeys.length);

      const result = omit(`?${qs}`, keysToOmit, opts);

      expect(result.querystring.startsWith("?")).toBe(true);
    },
  );

  test.prop([arbQueryString], { numRuns: NUM_RUNS.standard })(
    "keep with empty list returns empty querystring",
    (qs: string) => {
      const result = keep(qs, []);

      expect(result.querystring).toBe("");
      expect(result.keptParams).toStrictEqual({});
    },
  );

  test.prop([arbParamsWithSubset], { numRuns: NUM_RUNS.standard })(
    "keep never adds ? prefix to result querystring",
    ({
      qs,
      keysToOmit,
      opts,
    }: {
      qs: string;
      opts: Options;
      keysToOmit: string[];
    }) => {
      expect(keep(qs, keysToOmit, opts).querystring.startsWith("?")).toBe(
        false,
      );
      expect(keep(`?${qs}`, keysToOmit, opts).querystring.startsWith("?")).toBe(
        false,
      );
    },
  );
});
