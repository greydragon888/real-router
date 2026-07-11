// packages/route-utils/tests/property/segmentTesters.regex-equivalence.properties.ts
//
// Equivalence lock for the segment testers' matching semantics (Implementation Equivalence).
//
// The testers historically matched via cached RegExps (`^seg(?:\.|$)`,
// `(?:^|\.)seg$`, `(?:^|\.)seg(?:\.|$)` over the escaped segment). The
// implementation now uses allocation-free flat string comparisons; this suite
// pins that the OBSERVABLE semantics are exactly the regex ones by comparing
// every tester against an inline reference built from those very patterns.
// If a future edit drifts the flat form (a boundary check, a multi-occurrence
// scan), this lock fails with a concrete counterexample.

import { fc, test } from "@fast-check/vitest";

import { NUM_RUNS } from "./helpers";
import {
  endsWithSegment,
  includesSegment,
  startsWithSegment,
} from "../../src/segmentTesters";

// =============================================================================
// Reference: the pre-flat regex semantics, reproduced verbatim (no cache).
// =============================================================================

const escapeRegExp = (str: string): string =>
  str.replaceAll(/[$()*+.?[\\\]^{|}-]/g, String.raw`\$&`);

const refStarts = (name: string, segment: string): boolean =>
  new RegExp(String.raw`^${escapeRegExp(segment)}(?:\.|$)`).test(name);

const refEnds = (name: string, segment: string): boolean =>
  new RegExp(String.raw`(?:^|\.)${escapeRegExp(segment)}$`).test(name);

const refIncludes = (name: string, segment: string): boolean =>
  new RegExp(String.raw`(?:^|\.)${escapeRegExp(segment)}(?:\.|$)`).test(name);

const TESTERS = [
  ["startsWithSegment", startsWithSegment, refStarts],
  ["endsWithSegment", endsWithSegment, refEnds],
  ["includesSegment", includesSegment, refIncludes],
] as const;

// =============================================================================
// Generators — deliberately WIDER than helpers.arbSegment: dots and dashes in
// any position (leading/trailing/consecutive) are valid per SAFE_SEGMENT_PATTERN
// and are exactly the RegExp metacharacters the escape path had to neutralize.
// =============================================================================

const arbValidSegment: fc.Arbitrary<string> =
  fc.stringMatching(/^[\w.-]{1,24}$/);

// Names: same-alphabet strings (empty included), arbitrary unicode noise, and
// targeted compositions around the segment (exact hit, dot-bounded hit,
// prefix/suffix collisions that must NOT match).
const arbNameFor = (segment: string): fc.Arbitrary<string> =>
  fc.oneof(
    fc.stringMatching(/^[\w.-]{0,40}$/),
    fc.string({ maxLength: 30 }),
    fc.constantFrom(
      segment,
      `${segment}.tail`,
      `head.${segment}`,
      `head.${segment}.tail`,
      `${segment}x`,
      `x${segment}`,
      `x.${segment}x.y`,
      `${segment}.${segment}`,
      "",
    ),
  );

const arbPair: fc.Arbitrary<[string, string]> = arbValidSegment.chain(
  (segment) => fc.tuple(arbNameFor(segment), fc.constant(segment)),
);

// =============================================================================
// Inv 9: flat implementation ≡ reference regex semantics
// =============================================================================

describe("segmentTesters ≡ reference regex semantics (Implementation Equivalence)", () => {
  describe.each(TESTERS)("%s", (_label, tester, ref) => {
    test.prop([arbPair], { numRuns: NUM_RUNS.standard })(
      "direct form matches the reference for any (name, valid segment)",
      ([name, segment]: [string, string]) => {
        expect(tester(name, segment)).toBe(ref(name, segment));
      },
    );

    test.prop([arbPair], { numRuns: NUM_RUNS.standard })(
      "curried form matches the direct form and the reference (Inv 5 preserved)",
      ([name, segment]: [string, string]) => {
        const curried = tester(name);

        expect(curried(segment)).toBe(tester(name, segment));
        expect(curried(segment)).toBe(ref(name, segment));
      },
    );
  });

  test.prop(
    [
      // Non-empty name: with an invalid (empty) route name both forms return
      // `false` BEFORE segment validation (#769) — no throw to observe.
      fc.stringMatching(/^[\w.-]{1,10}$/),
      fc
        .string({ minLength: 1, maxLength: 20 })
        .filter((s) => !/^[\w.-]+$/.test(s)),
    ],
    { numRuns: NUM_RUNS.standard },
  )(
    "an invalid-character segment still throws TypeError on every call (validation not cached away)",
    (name: string, badSegment: string) => {
      for (const [, tester] of TESTERS) {
        expect(() => tester(name, badSegment)).toThrow(TypeError);
        // Repeat call: an invalid segment must never enter the validated cache.
        expect(() => tester(name, badSegment)).toThrow(TypeError);
      }
    },
  );

  it("an over-length segment still throws RangeError", () => {
    const long = "a".repeat(10_001);

    for (const [, tester] of TESTERS) {
      expect(() => tester("route.name", long)).toThrow(RangeError);
    }
  });
});
