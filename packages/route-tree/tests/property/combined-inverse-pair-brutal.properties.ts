import { fc, test } from "@fast-check/vitest";

import {
  arbAnyParamValue,
  arbAnyQueryValue,
  arbArrayFormat,
  arbArrayItems,
  createArrayMatcher,
  createMixedMatcher,
  NUM_RUNS,
} from "./helpers";

import type { QueryParamsConfig } from "../../src/createMatcher";

/**
 * BRUTAL combined inverse-pair at the INTEGRATION layer: `range(buildPath) ⊆
 * dom(match)` for a URL carrying BOTH a path param AND query params, where
 * `createMatcher` wires the REAL `search-params` codec into `path-matcher`'s
 * `SegmentMatcher`. Neither package tests this seam alone — `path-matcher` uses an
 * inline stub query codec, `search-params` has no path — and the existing
 * `roundtrip.properties.ts` pins `none` strategies. This sweeps the FULL 48-way
 * query-option matrix under adversarial path AND query values.
 *
 * Asserts TOTALITY (the built URL always matches back) + route identity + exact
 * PATH-param recovery (the path codec is independent of the query config). Query
 * VALUE recovery is deliberately NOT asserted — under `numberFormat:"auto"` /
 * `booleanFormat:"auto"` a value legitimately coerces (`"5"`→5, `"true"`→true);
 * exact query recovery lives in `search-params` / the `none`-pinned roundtrip.
 */

const arbQpConfig: fc.Arbitrary<QueryParamsConfig> = fc.record({
  arrayFormat: fc.constantFrom("none", "brackets", "index", "comma"),
  booleanFormat: fc.constantFrom("none", "auto", "empty-true"),
  nullFormat: fc.constantFrom("default", "hidden"),
  numberFormat: fc.constantFrom("none", "auto"),
});

describe("combined path+query inverse-pair — BRUTAL", () => {
  test.prop([arbAnyParamValue, arbAnyQueryValue, arbQpConfig], {
    numRuns: NUM_RUNS.thorough,
  })(
    "path param + query param: buildPath output always matches back, under every query-codec config",
    (category: string, q: string, qpConfig: QueryParamsConfig) => {
      const matcher = createMixedMatcher(qpConfig);
      const url = matcher.buildPath("results", { category, q });
      const result = matcher.match(url);

      // TOTALITY — the combined path+query URL is one match accepts.
      expect(
        result,
        `[${JSON.stringify(qpConfig)}] buildPath({ category: ${JSON.stringify(category)}, q: ${JSON.stringify(q)} }) → "${url}" did not match`,
      ).toBeDefined();
      // Route identity survives the round.
      expect(result!.segments.at(-1)!.fullName).toBe("results");
      // Path param is recovered exactly (path codec is independent of query config).
      expect(result!.params.category).toBe(category);
    },
  );

  // Array query param (`/items?tags`) alongside the path is NOT covered by the
  // query-only array test — here the array rides a real URL under every format.
  test.prop([arbArrayFormat, arbArrayItems], { numRuns: NUM_RUNS.standard })(
    "array query param: buildPath output always matches back under every array format",
    (arrayFormat, tags: string[]) => {
      const matcher = createArrayMatcher(arrayFormat);
      const url = matcher.buildPath("items", { tags });
      const result = matcher.match(url);

      expect(
        result,
        `[${arrayFormat}] buildPath({ tags: ${JSON.stringify(tags)} }) → "${url}" did not match`,
      ).toBeDefined();
      expect(result!.segments.at(-1)!.fullName).toBe("items");
    },
  );
});
