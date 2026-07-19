import { fc, test } from "@fast-check/vitest";

import { createInputNode, createRootWithChildren, NUM_RUNS } from "./helpers";
import { buildParamMeta } from "../../../../src/engine/path-matcher/buildParamMeta";
import { createTestMatcher } from "../../helpers/createTestMatcher";

import type { SegmentMatcher } from "../../../../src/engine/path-matcher/SegmentMatcher";

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

  describe("removed forms are rejected at registration (M1)", () => {
    const arbConstraintBody = fc.constantFrom(
      String.raw`\d+`,
      "[a-z]+",
      String.raw`\d?`,
      "(ab)?c",
      ".+?",
      "a?b?",
    );

    test.prop([arbParamName, arbConstraintBody], { numRuns: NUM_RUNS.fast })(
      "a `<re>` constraint on a param is rejected (constraint-removed)",
      (name, body) => {
        expect(() => singleRouteMatcher(`/a/:${name}<${body}>`)).toThrow(
          /Regex constraints are not supported/u,
        );
      },
    );

    test.prop([arbParamName], { numRuns: NUM_RUNS.fast })(
      "a `:x?` optional param is rejected (optional-removed)",
      (name) => {
        expect(() => singleRouteMatcher(`/a/:${name}?`)).toThrow(
          /Optional params are not supported/u,
        );
      },
    );

    test.prop([arbParamName], { numRuns: NUM_RUNS.fast })(
      "a `/:id?format` keeps the param and reads the tail as a query",
      (name) => {
        const meta = buildParamMeta(`/a/:${name}?tab`);

        expect(meta.urlParams).toStrictEqual([name]);
        expect(meta.queryParams).toStrictEqual(["tab"]);
      },
    );
  });
});

// #1050: the roundtrip properties above all place the marker at a segment
// BOUNDARY (`/h/:name`, `/files/*name`) — the generator gap that let a marker
// fused to a static prefix (`/h/abc:id`) drift between build/meta (which extract
// it as a param) and the trie (which compiles the segment as a literal). Generate
// that mid-segment shape and assert registerTree rejects it, so it can never
// reach build/match to drift — with the boundary form as the round-tripping
// control. This is the durable guard for the anchoring facet (#738 single-sourced
// the param-name class; this covers marker anchoring).
describe("Marker-anchoring properties (#1050)", () => {
  const arbStaticPrefix = fc.stringMatching(/^[a-z]{1,8}$/);

  test.prop([arbStaticPrefix, fc.constantFrom(":", "*"), arbParamName], {
    numRuns: NUM_RUNS.thorough,
  })(
    "a `:`/`*` marker fused to a static prefix within a segment is rejected",
    (prefix, marker, name) => {
      expect(() => {
        singleRouteMatcher(`/h/${prefix}${marker}${name}`);
      }).toThrow(/\[SegmentMatcher\.registerTree\]/);
    },
  );

  test.prop([arbStaticPrefix, arbParamName, arbValue], {
    numRuns: NUM_RUNS.standard,
  })(
    "the boundary form of the same pieces round-trips (control)",
    (prefix, name, value) => {
      const matcher = singleRouteMatcher(`/h/${prefix}/:${name}`);

      expect(matcher.match(`/h/${prefix}/${value}`)?.params).toStrictEqual({
        [name]: value,
      });
      expect(matcher.buildPath("h", { [name]: value })).toBe(
        `/h/${prefix}/${value}`,
      );
    },
  );
});
