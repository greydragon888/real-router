import { fc, test } from "@fast-check/vitest";

import { createInputNode, createRootWithChildren, NUM_RUNS } from "./helpers";
import { createTestMatcher } from "../../helpers/createTestMatcher";

import type { SegmentMatcher } from "../../../../src/engine/path-matcher/SegmentMatcher";
import type { SegmentMatcherOptions } from "../../../../src/engine/path-matcher/types";

/**
 * Query-parameter invariants for `match()` and `buildPath()`.
 *
 * The matcher exposes two query knobs that were only example-tested:
 * - `strictQueryParams` (match): an undeclared query key makes the URL unmatched.
 * - `queryParamsMode: "loose"` (build): undeclared keys pass through; default drops.
 *
 * Plus the basic guarantee that a declared query value survives `build → match`.
 */

// Route "/search" declaring two query params: q, page.
function queryMatcher(
  options?: Partial<SegmentMatcherOptions>,
): SegmentMatcher {
  const matcher = createTestMatcher(options);
  const search = createInputNode({
    name: "search",
    path: "/search?q&page",
    fullName: "search",
  });

  matcher.registerTree(createRootWithChildren([search]));

  return matcher;
}

// URL-safe key/value (no `&`, `=`, `?`, encoding) so the inline parser round-trips.
const arbKey = fc.stringMatching(/^[a-z][a-z0-9]{0,6}$/);
const arbVal = fc.stringMatching(/^[a-zA-Z0-9]{1,10}$/);
const arbUndeclaredKey = arbKey.filter((k) => k !== "q" && k !== "page");

describe("Query-parameter properties", () => {
  describe("strictQueryParams (match)", () => {
    test.prop([arbUndeclaredKey, arbVal], { numRuns: NUM_RUNS.standard })(
      "an undeclared query key makes the path unmatched",
      (key, val) => {
        const matcher = queryMatcher({ strictQueryParams: true });

        expect(matcher.match(`/search?${key}=${val}`)).toBeUndefined();
      },
    );

    test.prop([arbVal], { numRuns: NUM_RUNS.standard })(
      "declared query keys are accepted and captured",
      (val) => {
        const matcher = queryMatcher({ strictQueryParams: true });

        expect(matcher.match(`/search?q=${val}&page=2`)?.search).toStrictEqual({
          q: val,
          page: "2",
        });
      },
    );

    // The single-undeclared-key test above only ever exercises an all-undeclared
    // query, so it passes even for a strict check that validates "≥1 declared key
    // present" instead of "EVERY key declared" (it captures the declared key and
    // tolerates the rest). The invariant is `undefined` whenever ANY key is
    // undeclared — so the discriminating input is a query MIXING a declared key
    // with an undeclared one, in BOTH orders (the tolerance bug typically only
    // triggers once a declared key has already been seen).
    test.prop([arbUndeclaredKey, arbVal, arbVal], {
      numRuns: NUM_RUNS.standard,
    })(
      "an undeclared key mixed with a declared key still unmatches",
      (extra, declaredVal, extraVal) => {
        const matcher = queryMatcher({ strictQueryParams: true });

        // undeclared AFTER a declared key
        expect(
          matcher.match(`/search?q=${declaredVal}&${extra}=${extraVal}`),
        ).toBeUndefined();

        // undeclared BEFORE a declared key
        expect(
          matcher.match(`/search?${extra}=${extraVal}&q=${declaredVal}`),
        ).toBeUndefined();
      },
    );
  });

  describe("queryParamsMode (build)", () => {
    test.prop([arbUndeclaredKey, arbVal], { numRuns: NUM_RUNS.standard })(
      "default mode drops an undeclared query key; loose keeps it",
      (key, val) => {
        const matcher = queryMatcher();

        // Undeclared key dropped → bare path, no query.
        expect(matcher.buildPath("search", { [key]: val })).toBe("/search");

        // loose → key appears in the query string.
        const loose = matcher.buildPath(
          "search",
          { [key]: val },
          { queryParamsMode: "loose" },
        );

        expect(loose).toContain(key);
        expect(loose.startsWith("/search?")).toBe(true);
      },
    );
  });

  describe("declared query value roundtrip", () => {
    test.prop([arbVal], { numRuns: NUM_RUNS.thorough })(
      "a declared query param value survives build → match",
      (val) => {
        const matcher = queryMatcher();
        const url = matcher.buildPath("search", { q: val });

        expect(matcher.match(url)?.search).toStrictEqual({ q: val });
      },
    );
  });
});
