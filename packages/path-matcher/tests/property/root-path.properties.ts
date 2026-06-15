import { fc, test } from "@fast-check/vitest";

import { createInputNode, createRootWithChildren, NUM_RUNS } from "./helpers";
import { createTestMatcher } from "../helpers/createTestMatcher";

import type { SegmentMatcher } from "../../src/SegmentMatcher";

/**
 * Property-based coverage for rootPath segment-boundary matching (#736-cluster
 * 1.6).
 *
 * Invariant ("the root is a path prefix, matched only at a segment boundary"):
 * a path is accepted by a rooted matcher iff it equals the root or continues it
 * with a `/`-delimited segment. A path that merely shares the prefix *string*
 * (e.g. `/apple` under root `/app`) must never match — and the stripped
 * remainder always keeps its leading `/`, so no character is silently eaten.
 */

// Root base + route segment from disjoint, non-empty lowercase words so a
// prefix collision (`app` vs `apple`) is exercised without accidental overlap.
const arbWord = fc.stringMatching(/^[a-z]{2,8}$/);

function rootedMatcher(rootPath: string): SegmentMatcher {
  const matcher = createTestMatcher();
  const leaf = createInputNode({
    name: "leaf",
    path: "/leaf",
    fullName: "leaf",
  });

  matcher.registerTree(createRootWithChildren([leaf]));
  matcher.setRootPath(rootPath);

  return matcher;
}

describe("rootPath boundary properties (#736-cluster 1.6)", () => {
  test.prop([arbWord], { numRuns: NUM_RUNS.standard })(
    "a path that only shares the prefix string never matches",
    (base) => {
      const matcher = rootedMatcher(`/${base}`);

      // `/<base>leaf` shares the `/<base>` prefix but has no segment boundary.
      expect(matcher.match(`/${base}leaf`)).toBeUndefined();
      // A path under a different root never matches either.
      expect(matcher.match(`/not${base}/leaf`)).toBeUndefined();
    },
  );

  test.prop([arbWord], { numRuns: NUM_RUNS.standard })(
    "a path genuinely under the root matches with the leading slash preserved",
    (base) => {
      const matcher = rootedMatcher(`/${base}`);

      expect(matcher.match(`/${base}/leaf`)?.segments.at(-1)?.fullName).toBe(
        "leaf",
      );
    },
  );

  test.prop([arbWord], { numRuns: NUM_RUNS.standard })(
    "a trailing-slash root behaves identically at the boundary",
    (base) => {
      const matcher = rootedMatcher(`/${base}/`);

      expect(matcher.match(`/${base}/leaf`)?.segments.at(-1)?.fullName).toBe(
        "leaf",
      );
      expect(matcher.match(`/${base}leaf`)).toBeUndefined();
    },
  );
});
