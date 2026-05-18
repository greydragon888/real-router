import { fc, test } from "@fast-check/vitest";
import { startsWithSegment } from "@real-router/route-utils";

import { arbSegmentName, arbDottedName, NUM_RUNS } from "./helpers";

// =============================================================================
// isSegmentMatch — inlined from src/components/modern/RouteView/helpers.tsx
// =============================================================================

function isSegmentMatch(
  routeName: string,
  fullSegmentName: string,
  exact: boolean,
): boolean {
  if (fullSegmentName === "") {
    return false;
  }

  if (exact) {
    return routeName === fullSegmentName;
  }

  return startsWithSegment(routeName, fullSegmentName);
}

// =============================================================================
// Exact match: exact=true → routeName === fullSegmentName
// =============================================================================

describe("exact match: exact=true ↔ strict equality", () => {
  test.prop([arbDottedName, arbDottedName], { numRuns: NUM_RUNS.thorough })(
    "exact=true returns true iff routeName === fullSegmentName",
    (routeName: string, segmentName: string) => {
      const result = isSegmentMatch(routeName, segmentName, true);

      expect(result).toBe(routeName === segmentName);
    },
  );
});

// =============================================================================
// Monotonicity: exact=true → exact=false
// =============================================================================

describe("monotonicity: exact match implies non-exact match", () => {
  test.prop([arbDottedName, arbDottedName], { numRuns: NUM_RUNS.thorough })(
    "if isSegmentMatch(r, s, true) then isSegmentMatch(r, s, false)",
    (routeName: string, segmentName: string) => {
      const exactMatch = isSegmentMatch(routeName, segmentName, true);

      if (exactMatch) {
        expect(isSegmentMatch(routeName, segmentName, false)).toBe(true);
      }
    },
  );
});

// =============================================================================
// Self-match: isSegmentMatch(name, name, false) === true
// =============================================================================

describe("self-match: any name matches itself non-exactly", () => {
  test.prop([arbDottedName], { numRuns: NUM_RUNS.thorough })(
    "isSegmentMatch(name, name, false) === true",
    (name: string) => {
      expect(isSegmentMatch(name, name, false)).toBe(true);
    },
  );
});

// =============================================================================
// Dot boundary: segment matching respects dot boundaries
// =============================================================================

describe("dot-boundary: segment matching respects dot boundaries", () => {
  test.prop([arbSegmentName], { numRuns: NUM_RUNS.thorough })(
    "'users' does not match 'users2' — no false prefix matches",
    (suffix: string) => {
      const base = "users";
      const routeName = `${base}${suffix}`;

      // Only matches if suffix is empty (routeName === base)
      // or suffix starts with "." (routeName is a child segment)
      if (suffix.length > 0 && !suffix.startsWith(".")) {
        expect(isSegmentMatch(routeName, base, false)).toBe(false);
      }
    },
  );
});

// =============================================================================
// Empty segment: fullSegmentName="" must never match (early return)
// =============================================================================

describe('empty segment: fullSegmentName="" always returns false', () => {
  test.prop([arbDottedName], { numRuns: NUM_RUNS.thorough })(
    "exact=false with empty segment never matches any routeName",
    (routeName: string) => {
      expect(isSegmentMatch(routeName, "", false)).toBe(false);
    },
  );

  test.prop([arbDottedName], { numRuns: NUM_RUNS.thorough })(
    "exact=true with empty segment never matches any routeName",
    (routeName: string) => {
      expect(isSegmentMatch(routeName, "", true)).toBe(false);
    },
  );
});

// =============================================================================
// Dot-boundary multi-segment (review §6 MED): segment is a proper prefix of
// the route name spanning multiple `.` separators. `<RouteView nodeName="a">`
// must still match `a.b.c.d` non-exactly, while exact=true must reject every
// route name that is not character-identical to the segment.
// =============================================================================

describe("dot-boundary multi-segment: deep route name matches its segment ancestors non-exactly", () => {
  test.prop([fc.array(arbSegmentName, { minLength: 2, maxLength: 5 })], {
    numRuns: NUM_RUNS.thorough,
  })(
    "every prefix path of a deep dotted route matches non-exactly, only the full path matches exactly",
    (segments: string[]) => {
      const routeName = segments.join(".");

      for (let i = 1; i <= segments.length; i++) {
        const prefix = segments.slice(0, i).join(".");

        // Non-exact: every ancestor segment AND the full route name match.
        expect(isSegmentMatch(routeName, prefix, false)).toBe(true);

        // Exact: only the full route name matches; every proper ancestor
        // segment is shorter than routeName and must NOT exact-match.
        const expectExact = prefix === routeName;

        expect(isSegmentMatch(routeName, prefix, true)).toBe(expectExact);
      }
    },
  );

  test.prop([arbSegmentName, arbSegmentName, arbSegmentName], {
    numRuns: NUM_RUNS.thorough,
  })(
    'route "a.b" does NOT match segment "a.b.c" (segment longer than route — no false suffix match)',
    (a: string, b: string, c: string) => {
      fc.pre(a !== b && b !== c && a !== c);
      const routeName = `${a}.${b}`;
      const longerSegment = `${a}.${b}.${c}`;

      expect(isSegmentMatch(routeName, longerSegment, false)).toBe(false);
      expect(isSegmentMatch(routeName, longerSegment, true)).toBe(false);
    },
  );
});

// =============================================================================
// Edge-case: routeName="" (root state) — review §5 MED. The empty-segment
// branch handles the OPPOSITE side (fullSegmentName==""); this section locks
// down the symmetric case where the *route name* is empty. A consumer that
// re-uses `<RouteView nodeName="">` against `route.name === ""` would land
// here, so the contract has to be explicit.
// =============================================================================

describe('edge-case: routeName="" (root state) — review §5 MED', () => {
  test.prop([arbSegmentName], { numRuns: NUM_RUNS.thorough })(
    "empty routeName never matches any non-empty segment (exact OR non-exact)",
    (segment: string) => {
      expect(isSegmentMatch("", segment, false)).toBe(false);
      expect(isSegmentMatch("", segment, true)).toBe(false);
    },
  );

  test("empty routeName + empty segment → false (early-return wins regardless of exact flag)", () => {
    // Documented contract: empty `fullSegmentName` is the disqualifier.
    // Root-vs-root self-matching is the caller's responsibility (processMatch
    // builds `fullSegmentName = nodeName ? `${nodeName}.${segment}` : segment`
    // — a `<Match segment="">` is a usage error and not silently activated).
    expect(isSegmentMatch("", "", false)).toBe(false);
    expect(isSegmentMatch("", "", true)).toBe(false);
  });

  test.prop([arbSegmentName, arbSegmentName], { numRuns: NUM_RUNS.thorough })(
    "empty routeName never matches a dotted segment either",
    (a: string, b: string) => {
      fc.pre(a !== b);
      const dotted = `${a}.${b}`;

      expect(isSegmentMatch("", dotted, false)).toBe(false);
      expect(isSegmentMatch("", dotted, true)).toBe(false);
    },
  );
});

// =============================================================================
// Edge-case: very long route names (review §5 LOW) — defends against an
// accidental O(n²) regression in startsWithSegment + the dot-boundary regex.
// The regex caches per-segment, so the worst-case input is one long route
// name walked against many distinct segments. We do a single deep walk and
// require it to terminate within vitest's per-test wall.
// =============================================================================

describe("edge-case: very long route names (review §5 LOW)", () => {
  // Use a *deterministic* generator (no fc.pre rejection), capped at 64
  // segments so each iteration completes well inside vitest's budget.
  const arbDeepRouteName = fc
    .array(arbSegmentName, { minLength: 20, maxLength: 64 })
    .map((segments) => segments.join("."));

  test.prop([arbDeepRouteName], { numRuns: NUM_RUNS.standard })(
    "self-match holds for 20..64-segment names (non-exact + exact)",
    (deepName: string) => {
      expect(isSegmentMatch(deepName, deepName, false)).toBe(true);
      expect(isSegmentMatch(deepName, deepName, true)).toBe(true);
    },
  );

  test.prop([arbDeepRouteName], { numRuns: NUM_RUNS.standard })(
    "every prefix of a deep name matches non-exactly; only the full name matches exactly",
    (deepName: string) => {
      const segments = deepName.split(".");

      // Sample three prefixes (start, middle, end) — exhaustive walk would
      // multiply runtime by O(segments.length) and dominate the suite.
      const indexes = new Set([
        0,
        Math.floor(segments.length / 2),
        segments.length - 1,
      ]);

      for (const i of indexes) {
        const prefix = segments.slice(0, i + 1).join(".");

        expect(isSegmentMatch(deepName, prefix, false)).toBe(true);
        expect(isSegmentMatch(deepName, prefix, true)).toBe(
          prefix === deepName,
        );
      }
    },
  );
});
