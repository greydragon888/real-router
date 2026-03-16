import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";

import {
  startsWithSegment,
  endsWithSegment,
  includesSegment,
  areRoutesRelated,
  RouteUtils,
} from "@real-router/route-utils";

import {
  NUM_RUNS,
  arbSegment,
  arbRouteName,
  arbMultiSegmentName,
  arbDisjointPair,
  getLastSegment,
  getParentSegment,
  getFirstSegment,
} from "./helpers";

import type { RouteTreeNode } from "../../src/types";

describe("routeUtils property-based tests", () => {
  describe("startsWithSegment consistency with single-segment names", () => {
    test.prop([arbRouteName], { numRuns: NUM_RUNS.standard })(
      "startsWithSegment(name, lastSegment) is true iff name has no dot or first segment equals last segment",
      (name) => {
        const firstSeg = getFirstSegment(name);
        const lastSeg = getLastSegment(name);
        const expected = !name.includes(".") || firstSeg === lastSeg;
        const result = startsWithSegment(name, lastSeg);

        expect(result).toStrictEqual(expected);
      },
    );
  });

  describe("endsWithSegment is always true for the last segment", () => {
    test.prop([arbRouteName], { numRuns: NUM_RUNS.standard })(
      "endsWithSegment(name, getLastSegment(name)) is always true",
      (name) => {
        const lastSeg = getLastSegment(name);

        expect(endsWithSegment(name, lastSeg)).toStrictEqual(true);
      },
    );
  });

  describe("getParentSegment + getLastSegment reconstructs the name", () => {
    test.prop([arbMultiSegmentName], { numRuns: NUM_RUNS.standard })(
      "parent + '.' + lastSegment === original name (for multi-segment names)",
      (name) => {
        const parent = getParentSegment(name);
        const last = getLastSegment(name);

        expect(`${parent}.${last}`).toStrictEqual(name);
      },
    );
  });

  describe("includesSegment detects full segments, not substrings", () => {
    test.prop(
      [
        fc.array(arbSegment, { minLength: 2, maxLength: 5 }),
        fc.integer({ min: 0, max: 4 }),
      ],
      { numRuns: NUM_RUNS.standard },
    )(
      "includesSegment finds every actual segment in a route name",
      (segs, rawIndex) => {
        const index = rawIndex % segs.length;
        const name = segs.join(".");
        const seg = segs[index];

        expect(includesSegment(name, seg)).toStrictEqual(true);
      },
    );

    test.prop(
      [
        fc.array(arbSegment, { minLength: 2, maxLength: 5 }),
        fc.integer({ min: 0, max: 4 }),
      ],
      { numRuns: NUM_RUNS.standard },
    )(
      "includesSegment returns false for prefix that is not a full segment",
      (segs, rawIndex) => {
        const index = rawIndex % segs.length;
        const name = segs.join(".");
        const seg = segs[index];

        if (seg.length <= 1) {
          return;
        }

        const truncated = seg.slice(0, -1);

        if (segs.includes(truncated)) {
          return;
        }

        expect(includesSegment(name, truncated)).toStrictEqual(false);
      },
    );
  });

  describe("single-segment names satisfy all three testers", () => {
    test.prop([arbSegment], { numRuns: NUM_RUNS.standard })(
      "for a single segment, all three testers return true with that segment",
      (seg) => {
        expect(startsWithSegment(seg, seg)).toStrictEqual(true);
        expect(endsWithSegment(seg, seg)).toStrictEqual(true);
        expect(includesSegment(seg, seg)).toStrictEqual(true);
      },
    );
  });

  describe("empty strings always return false", () => {
    test.prop([arbSegment], { numRuns: NUM_RUNS.standard })(
      "empty route name returns false for all three testers with any segment",
      (seg) => {
        expect(startsWithSegment("", seg)).toStrictEqual(false);
        expect(endsWithSegment("", seg)).toStrictEqual(false);
        expect(includesSegment("", seg)).toStrictEqual(false);
      },
    );

    test.prop([arbRouteName], { numRuns: NUM_RUNS.standard })(
      "empty segment returns false for all three testers with any route name",
      (name) => {
        expect(startsWithSegment(name, "")).toStrictEqual(false);
        expect(endsWithSegment(name, "")).toStrictEqual(false);
        expect(includesSegment(name, "")).toStrictEqual(false);
      },
    );
  });

  describe("areRoutesRelated is symmetric", () => {
    test.prop([arbRouteName, arbRouteName], { numRuns: NUM_RUNS.standard })(
      "areRoutesRelated(a, b) === areRoutesRelated(b, a)",
      (a, b) => {
        expect(areRoutesRelated(a, b)).toStrictEqual(areRoutesRelated(b, a));
      },
    );

    test.prop([arbRouteName], { numRuns: NUM_RUNS.standard })(
      "areRoutesRelated(a, a) is always true",
      (name) => {
        expect(areRoutesRelated(name, name)).toStrictEqual(true);
      },
    );

    test.prop([arbMultiSegmentName], { numRuns: NUM_RUNS.standard })(
      "areRoutesRelated(name, parent) is always true for direct parent",
      (name) => {
        const parent = getParentSegment(name);

        expect(areRoutesRelated(name, parent)).toStrictEqual(true);
        expect(areRoutesRelated(parent, name)).toStrictEqual(true);
      },
    );
  });

  // ===================================================================
  // §8 curried form and null guard
  // ===================================================================

  describe("curried form equivalence", () => {
    test.prop([arbRouteName, arbSegment], { numRuns: NUM_RUNS.standard })(
      "f(route)(segment) === f(route, segment) for all three testers",
      (route, segment) => {
        const startsCurried = startsWithSegment(route);
        const endsCurried = endsWithSegment(route);
        const includesCurried = includesSegment(route);

        expect(startsCurried(segment)).toStrictEqual(
          startsWithSegment(route, segment),
        );
        expect(endsCurried(segment)).toStrictEqual(
          endsWithSegment(route, segment),
        );
        expect(includesCurried(segment)).toStrictEqual(
          includesSegment(route, segment),
        );
      },
    );
  });

  describe("null segment returns false", () => {
    test.prop([arbRouteName], { numRuns: NUM_RUNS.standard })(
      "all three testers return false for null segment",
      (name) => {
        expect(startsWithSegment(name, null)).toStrictEqual(false);
        expect(endsWithSegment(name, null)).toStrictEqual(false);
        expect(includesSegment(name, null)).toStrictEqual(false);
      },
    );
  });

  // ===================================================================
  // §9 segment matching extensions
  // ===================================================================

  describe("multi-segment includesSegment", () => {
    test.prop([fc.array(arbSegment, { minLength: 3, maxLength: 6 })], {
      numRuns: NUM_RUNS.standard,
    })(
      "includesSegment detects contiguous multi-segment subsequences",
      (segs) => {
        const name = segs.join(".");
        const start = fc.sample(
          fc.integer({ min: 0, max: segs.length - 2 }),
          1,
        )[0];
        const end = fc.sample(
          fc.integer({ min: start + 2, max: segs.length }),
          1,
        )[0];
        const subseq = segs.slice(start, end).join(".");

        expect(includesSegment(name, subseq)).toStrictEqual(true);
      },
    );
  });

  describe("startsWithSegment for first segment", () => {
    test.prop([arbMultiSegmentName], { numRuns: NUM_RUNS.standard })(
      "startsWithSegment(name, firstSegment) is always true",
      (name) => {
        const firstSeg = getFirstSegment(name);

        expect(startsWithSegment(name, firstSeg)).toStrictEqual(true);
      },
    );
  });

  // ===================================================================
  // §10 isDescendantOf properties
  // ===================================================================

  describe("isDescendantOf properties", () => {
    const minimalRoot: RouteTreeNode = {
      fullName: "",
      children: new Map(),
      nonAbsoluteChildren: [],
    };
    const utils = new RouteUtils(minimalRoot);

    test.prop([arbRouteName], { numRuns: NUM_RUNS.standard })(
      "irreflexivity: isDescendantOf(name, name) is always false",
      (name) => {
        expect(utils.isDescendantOf(name, name)).toStrictEqual(false);
      },
    );

    test.prop([arbMultiSegmentName], { numRuns: NUM_RUNS.standard })(
      "consistency: isDescendantOf(child, parent) implies areRoutesRelated(child, parent)",
      (name) => {
        const parent = getParentSegment(name);

        expect(utils.isDescendantOf(name, parent)).toStrictEqual(true);
        expect(areRoutesRelated(name, parent)).toStrictEqual(true);
      },
    );

    test.prop([arbMultiSegmentName], { numRuns: NUM_RUNS.standard })(
      "antisymmetry: isDescendantOf(child, parent) → ¬isDescendantOf(parent, child)",
      (name) => {
        const parent = getParentSegment(name);

        expect(utils.isDescendantOf(name, parent)).toStrictEqual(true);
        expect(utils.isDescendantOf(parent, name)).toStrictEqual(false);
      },
    );

    test.prop(
      [
        fc
          .array(arbSegment, { minLength: 3, maxLength: 5 })
          .map((s) => s.join(".")),
      ],
      { numRuns: NUM_RUNS.standard },
    )(
      "transitivity: isDescendantOf(a, b) ∧ isDescendantOf(b, c) → isDescendantOf(a, c)",
      (name) => {
        const parent = getParentSegment(name);
        const grandparent = getParentSegment(parent);

        expect(utils.isDescendantOf(name, parent)).toStrictEqual(true);
        expect(utils.isDescendantOf(parent, grandparent)).toStrictEqual(true);
        expect(utils.isDescendantOf(name, grandparent)).toStrictEqual(true);
      },
    );
  });

  // ===================================================================
  // §11 areRoutesRelated non-relatedness
  // ===================================================================

  describe("areRoutesRelated non-relatedness", () => {
    test.prop([arbDisjointPair], { numRuns: NUM_RUNS.standard })(
      "routes with different first segments are never related",
      ([a, b]) => {
        expect(areRoutesRelated(a, b)).toStrictEqual(false);
      },
    );
  });

  // ===================================================================
  // ===================================================================

  describe("validation: character pattern", () => {
    const arbInvalidSegment = fc
      .tuple(
        fc.stringMatching(/^[a-z\d]{0,5}$/),
        fc.constantFrom(
          " ",
          "!",
          "@",
          "#",
          "$",
          "%",
          "/",
          ":",
          "?",
          "+",
          "~",
          "|",
        ),
        fc.stringMatching(/^[a-z\d]{0,5}$/),
      )
      .map(([pre, ch, suf]) => `${pre}${ch}${suf}`);

    test.prop([arbRouteName, arbSegment], { numRuns: NUM_RUNS.standard })(
      "valid characters: segments matching SAFE_SEGMENT_PATTERN are accepted",
      (name, segment) => {
        expect(() => startsWithSegment(name, segment)).not.toThrowError();
        expect(() => endsWithSegment(name, segment)).not.toThrowError();
        expect(() => includesSegment(name, segment)).not.toThrowError();
      },
    );

    test.prop([arbRouteName, arbInvalidSegment], {
      numRuns: NUM_RUNS.standard,
    })(
      "invalid characters: segments with forbidden characters throw TypeError",
      (name, segment) => {
        expect(() => startsWithSegment(name, segment)).toThrowError(TypeError);
        expect(() => endsWithSegment(name, segment)).toThrowError(TypeError);
        expect(() => includesSegment(name, segment)).toThrowError(TypeError);
      },
    );
  });

  describe("validation: segment length", () => {
    const arbOversizedSegment = fc
      .integer({ min: 10_001, max: 10_050 })
      .map((length) => "a".repeat(length));

    test.prop([arbRouteName, arbOversizedSegment], {
      numRuns: NUM_RUNS.standard,
    })("oversized segments throw RangeError", (name, segment) => {
      expect(() => startsWithSegment(name, segment)).toThrowError(RangeError);
      expect(() => endsWithSegment(name, segment)).toThrowError(RangeError);
      expect(() => includesSegment(name, segment)).toThrowError(RangeError);
    });
  });
});
