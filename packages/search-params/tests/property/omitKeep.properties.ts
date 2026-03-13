import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  arbSearchParamsStrings,
  arbOptions,
  arbQueryString,
  arbSafeKey,
  NUM_RUNS,
} from "./helpers";
import { build, omit, keep, parse } from "../../src";

import type { Options } from "../../src";

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

  test.prop([fc.tuple(arbSearchParamsStrings, arbOptions, arbSafeKey)], {
    numRuns: NUM_RUNS.standard,
  })(
    "complement: keep(qs, keys) has none of the keys NOT in keys",
    ([params, opts, extraKey]: [Record<string, string>, Options, string]) => {
      fc.pre(!Object.prototype.hasOwnProperty.call(params, extraKey));

      const qs = build(params, opts);
      const keepKeys = Object.keys(params);
      const result = keep(qs, keepKeys, opts);
      const keptKeys = new Set(Object.keys(result.keptParams));

      expect(keptKeys.has(extraKey)).toBe(false);
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
