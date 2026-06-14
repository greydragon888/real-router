import { fc, test } from "@fast-check/vitest";

import { createInputNode, createRootWithChildren, NUM_RUNS } from "./helpers";
import { buildParamMeta } from "../../src/buildParamMeta";
import { createTestMatcher } from "../helpers/createTestMatcher";

import type { SegmentMatcher } from "../../src/SegmentMatcher";

/**
 * Property-based coverage for the unified param grammar (#738).
 *
 * Two invariants, one root cause ("single source of truth for what a parameter
 * is and how it is named"):
 *
 * - **Name-grammar agreement.** Whatever param NAME the match-path grammar
 *   accepts, the build-path grammar accepts identically: `match()` captures the
 *   value under exactly the name `buildPath()` expects, for any name from the
 *   canonical class (`[^/?<]+`, not just `\w`). The old `[^/?<]+` vs `[\w]+`
 *   split made `:my-param` match but `buildPath` throw `Missing required 'my'`.
 * - **Constraint-internal `?` never leaks as query.** A `?` inside a `<...>`
 *   constraint (lazy quantifier, optional group) must never be mistaken for the
 *   query separator — `urlParams`/constraint stay intact, `queryParams` empty.
 */

// Names from the canonical class: start with a letter, then a diverse mix of
// chars that are all valid both in a name and as a single URL segment value.
const arbParamName = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_.~-]{0,11}$/);

// URL-safe single-segment value (round-trips through encode/decode unchanged).
const arbValue = fc.stringMatching(/^[a-zA-Z0-9]{1,10}$/);

function singleRouteMatcher(path: string): SegmentMatcher {
  const matcher = createTestMatcher();
  const route = createInputNode({ name: "h", path, fullName: "h" });

  matcher.registerTree(createRootWithChildren([route]));

  return matcher;
}

describe("Param-grammar properties (#738)", () => {
  test.prop([arbParamName, arbValue], { numRuns: NUM_RUNS.thorough })(
    "match key equals build key for any canonical param name",
    (name, value) => {
      const matcher = singleRouteMatcher(`/h/:${name}`);

      // match captures under exactly `name`...
      expect(matcher.match(`/h/${value}`)?.params).toStrictEqual({
        [name]: value,
      });

      // ...and buildPath round-trips under the same name (no grammar split).
      expect(() => matcher.buildPath("h", { [name]: value })).not.toThrow();
      expect(matcher.buildPath("h", { [name]: value })).toBe(`/h/${value}`);
    },
  );

  test.prop([arbParamName, arbValue], { numRuns: NUM_RUNS.standard })(
    "splat name grammar agrees between match and build",
    (name, value) => {
      const matcher = singleRouteMatcher(`/files/*${name}`);

      expect(matcher.match(`/files/${value}`)?.params).toStrictEqual({
        [name]: value,
      });
      expect(matcher.buildPath("h", { [name]: value })).toBe(`/files/${value}`);
    },
  );

  describe("constraint-internal `?` never leaks as a query param", () => {
    const arbConstraintBodyWithQ = fc.constantFrom(
      String.raw`\d?`,
      String.raw`\d{1,3}?`,
      String.raw`\w+?`,
      "(ab)?c",
      ".+?",
      "a?b?",
    );

    test.prop([arbConstraintBodyWithQ], { numRuns: NUM_RUNS.fast })(
      "constraint body containing `?` keeps urlParams intact, queryParams empty",
      (body) => {
        const meta = buildParamMeta(`/a/:id<${body}>`);

        expect(meta.urlParams).toStrictEqual(["id"]);
        expect(meta.queryParams).toStrictEqual([]);
        expect(meta.constraintPatterns.has("id")).toBe(true);
        expect(meta.pathPattern).toBe(`/a/:id<${body}>`);
      },
    );

    test.prop([arbConstraintBodyWithQ], { numRuns: NUM_RUNS.fast })(
      "a real query is still detected after a `?`-bearing constraint",
      (body) => {
        const meta = buildParamMeta(`/a/:id<${body}>?tab&page`);

        expect(meta.urlParams).toStrictEqual(["id"]);
        expect(meta.queryParams).toStrictEqual(["tab", "page"]);
        expect(meta.constraintPatterns.has("id")).toBe(true);
      },
    );
  });
});
