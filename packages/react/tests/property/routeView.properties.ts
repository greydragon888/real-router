import { test } from "@fast-check/vitest";
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
