import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";

import { arbActiveOptions, NUM_RUNS } from "./helpers";
import {
  DEFAULT_ACTIVE_OPTIONS,
  normalizeActiveOptions,
} from "../../src/normalizeActiveOptions.js";

import type { ActiveRouteSourceOptions } from "../../src/types.js";

describe("normalizeActiveOptions — invariants", () => {
  test.prop([arbActiveOptions], { numRuns: NUM_RUNS.standard })(
    "idempotency: normalize(normalize(x)) === normalize(x) (structural)",
    (options) => {
      const once = normalizeActiveOptions(options);
      const twice = normalizeActiveOptions(
        // Re-feed a partial shape — `hash` may be undefined, which is the
        // documented "ignore hash" sentinel.
        once as unknown as ActiveRouteSourceOptions,
      );

      expect(twice).toStrictEqual(once);
    },
  );

  test.prop([arbActiveOptions], { numRuns: NUM_RUNS.standard })(
    "default-fill: missing fields are populated from DEFAULT_ACTIVE_OPTIONS",
    (options) => {
      const result = normalizeActiveOptions(options);

      expect(result.strict).toBe(
        options.strict ?? DEFAULT_ACTIVE_OPTIONS.strict,
      );
      expect(result.ignoreQueryParams).toBe(
        options.ignoreQueryParams ?? DEFAULT_ACTIVE_OPTIONS.ignoreQueryParams,
      );
      // `hash` deliberately stays `undefined` when absent — `undefined` is the
      // meaningful "ignore hash" sentinel for the source layer.
      expect(result.hash).toBe(options.hash);
    },
  );

  test.prop([arbActiveOptions], { numRuns: NUM_RUNS.standard })(
    "DEFAULT_ACTIVE_OPTIONS is not mutated by repeated normalizations",
    (options) => {
      const before = { ...DEFAULT_ACTIVE_OPTIONS };

      normalizeActiveOptions(options);
      normalizeActiveOptions(options);

      expect(DEFAULT_ACTIVE_OPTIONS).toStrictEqual(before);
    },
  );

  test.prop(
    [
      fc.boolean(),
      fc.boolean(),
      fc.option(fc.string({ maxLength: 8 }), { nil: undefined }),
    ],
    { numRuns: NUM_RUNS.standard },
  )(
    "explicit values are preserved verbatim",
    (strict, ignoreQueryParams, hash) => {
      const input: ActiveRouteSourceOptions =
        hash === undefined
          ? { strict, ignoreQueryParams }
          : { strict, ignoreQueryParams, hash };
      const result = normalizeActiveOptions(input);

      expect(result.strict).toBe(strict);
      expect(result.ignoreQueryParams).toBe(ignoreQueryParams);
      expect(result.hash).toBe(hash);
    },
  );

  test("undefined input falls back entirely to defaults", () => {
    expect(normalizeActiveOptions()).toStrictEqual({
      strict: DEFAULT_ACTIVE_OPTIONS.strict,
      ignoreQueryParams: DEFAULT_ACTIVE_OPTIONS.ignoreQueryParams,
      hash: undefined,
    });
  });

  // Pure-function PBT — bumped to 1000 runs for the new invariants.
  const PURE_RUNS = 1000;

  function localeSortKeys(keys: string[]): string[] {
    return keys.toSorted((a, b) => a.localeCompare(b));
  }

  function localeSortEntries(
    entries: [string, unknown][],
  ): [string, unknown][] {
    return entries.toSorted(([a], [b]) => a.localeCompare(b));
  }

  test.prop([arbActiveOptions], { numRuns: PURE_RUNS })(
    "input non-mutation: normalize(x) does not mutate x (audit §2/§6 MEDIUM)",
    (options) => {
      // Capture observable shape without depending on the prototype chain
      // (fast-check may shrink to `{__proto__: null}` records).
      const beforeKeys = localeSortKeys(Object.keys(options));
      const beforeEntries = localeSortEntries(Object.entries(options));

      normalizeActiveOptions(options);
      normalizeActiveOptions(options);

      expect(localeSortKeys(Object.keys(options))).toStrictEqual(beforeKeys);
      expect(localeSortEntries(Object.entries(options))).toStrictEqual(
        beforeEntries,
      );
    },
  );

  test.prop([arbActiveOptions], { numRuns: PURE_RUNS })(
    "totality: output always has exactly three own keys — strict, ignoreQueryParams, hash",
    (options) => {
      const result = normalizeActiveOptions(options);

      expect(localeSortKeys(Object.keys(result))).toStrictEqual([
        "hash",
        "ignoreQueryParams",
        "strict",
      ]);
    },
  );
});
