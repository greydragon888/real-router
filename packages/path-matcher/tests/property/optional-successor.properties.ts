import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";

import {
  arbSafeParamValue,
  createInputNode,
  createRootWithChildren,
  NUM_RUNS,
} from "./helpers";
import { createTestMatcher } from "../helpers/createTestMatcher";

/**
 * SUPPORT-NARROWER preventer (#1263/#1264): the validity-anchored family
 * `optional param → dynamic segment` must satisfy the inverse-pair contract. Two
 * layers (side-audit): `buildPath` is INJECTIVE for opt+required (params-equality
 * round-trip holds), but NON-injective for opt→splat (two param sets build the
 * same URL) — there only the weaker **path-fixpoint** (INVARIANTS #18) holds:
 * `buildPath(r, match(buildPath(r, p)).params) === buildPath(r, p)`.
 */

const versioned = () =>
  createInputNode({
    name: "r",
    path: String.raw`/:v<v\d+>?/*rest`,
    fullName: "r",
  });
const tenant = () =>
  createInputNode({ name: "r", path: "/:a?/:b", fullName: "r" });

function matcherFor(node: ReturnType<typeof createInputNode>) {
  const m = createTestMatcher();

  m.registerTree(createRootWithChildren([node]));

  return m;
}

// A multi-segment splat value whose FIRST segment is NOT `v\d+` (so it does not
// collide with the version take-interpretation — the omit form stays recoverable).
const arbNonVersionSplat = fc
  .array(
    arbSafeParamValue.filter((s) => !/^v\d+$/.test(s)),
    { minLength: 1, maxLength: 3 },
  )
  .map((segs) => segs.join("/"));

describe("optional-successor inverse-pair (#1263/#1264)", () => {
  test.prop([arbSafeParamValue, arbSafeParamValue], {
    numRuns: NUM_RUNS.standard,
  })(
    "opt+required /:a?/:b is fully invertible (params round-trip, both forms)",
    (a, b) => {
      const m = matcherFor(tenant());

      // omit form: only b
      const omit = m.match(m.buildPath("r", { b }));

      expect(omit?.params).toStrictEqual({ b });

      // present form: both
      const present = m.match(m.buildPath("r", { a, b }));

      expect(present?.params).toStrictEqual({ a, b });
    },
  );

  test.prop([fc.stringMatching(/^v\d{1,6}$/), arbNonVersionSplat], {
    numRuns: NUM_RUNS.standard,
  })(
    "constrained-opt→splat: TOTALITY + path-fixpoint (#18) both forms",
    (version, rest) => {
      const m = matcherFor(versioned());

      for (const params of [{ rest }, { v: version, rest }]) {
        const url = m.buildPath("r", params);
        const result = m.match(url);

        // TOTALITY — range(buildPath) ⊆ dom(match)
        expect(result, `"${url}" did not match`).toBeDefined();
        // path-fixpoint (#18) — rebuilding the matched params yields the same URL,
        // even where buildPath is non-injective (the take-preimage is canonical).
        expect(m.buildPath("r", result!.params)).toBe(url);
      }
    },
  );
});
