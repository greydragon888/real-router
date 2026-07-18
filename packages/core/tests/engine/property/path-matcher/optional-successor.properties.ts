import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";

import {
  arbSafeParamValue,
  createInputNode,
  createRootWithChildren,
  NUM_RUNS,
} from "./helpers";
import { createTestMatcher } from "../../helpers/createTestMatcher";

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

  // #1283: a SINGLE-segment omit form — including a version-LOOKING value that
  // satisfies the take-constraint — is exactly the case `arbNonVersionSplat` filtered
  // out (the generator blind spot that hid #1283). The last-segment take dead-ends
  // (an empty splat is invalid), so `match` must fall to the omit reading, not UNMATCH.
  test.prop([fc.oneof(fc.stringMatching(/^v\d{1,6}$/), arbSafeParamValue)], {
    numRuns: NUM_RUNS.standard,
  })(
    "constrained-opt→splat: a single-segment omit form (incl. version-looking) round-trips (#1283)",
    (seg) => {
      const m = matcherFor(versioned());
      const url = m.buildPath("r", { rest: seg });
      const result = m.match(url);

      // TOTALITY — the last-segment omit form must resolve, not dead-end
      expect(
        result,
        `"${url}" (single-segment omit) did not match`,
      ).toBeDefined();
      expect(m.buildPath("r", result!.params)).toBe(url); // path-fixpoint #18
    },
  );
});

/**
 * #1266: the SAME try-take-if-valid mechanism, generalized to a REQUIRED param with
 * a splat sibling from another route — no `optional` anywhere. A `/*rest` catch-all
 * next to `/:v<v\d+>/*rest`: a first segment failing the constraint must fall to the
 * catch-all (INVARIANTS #8), not die in the greedy param branch.
 */
const catchAll = () => [
  createInputNode({ name: "all", path: "/*rest", fullName: "all" }),
  createInputNode({
    name: "ver",
    path: String.raw`/:v<v\d+>/*rest`,
    fullName: "ver",
  }),
];

function catchAllMatcher() {
  const m = createTestMatcher();

  m.registerTree(createRootWithChildren(catchAll()));

  return m;
}

describe("catch-all reachable next to a constrained param+splat sibling (#1266)", () => {
  test.prop([arbNonVersionSplat], { numRuns: NUM_RUNS.standard })(
    "a non-version path reaches the /*rest catch-all — buildPath round-trips (no dead deep-link)",
    (rest) => {
      const m = catchAllMatcher();
      const url = m.buildPath("all", { rest });
      const result = m.match(url);

      expect(result, `"${url}" did not reach the catch-all`).toBeDefined();
      expect(result!.segments.at(-1)?.name).toBe("all");
      expect(result!.params).toStrictEqual({ rest });
    },
  );

  test.prop([fc.stringMatching(/^v\d{1,6}$/), arbNonVersionSplat], {
    numRuns: NUM_RUNS.standard,
  })(
    "a version-satisfying first segment routes to the constrained param (not the catch-all)",
    (version, rest) => {
      const m = catchAllMatcher();
      const result = m.match(`/${version}/${rest}`);

      expect(result?.segments.at(-1)?.name).toBe("ver");
      expect(result?.params).toStrictEqual({ v: version, rest });
    },
  );
});

/**
 * #1288: with the validated sub-traverse, totality + path-fixpoint (#18) hold on
 * a FREE splat value — no first-segment filtering. `arbNonVersionSplat` above
 * deliberately avoided version-looking first segments (the pre-#1288 blind spot);
 * this layer generates them on purpose: a colliding value canonicalizes to the
 * take reading (same URL back), everything else keeps its params.
 */
const arbFreeSplat = fc
  .array(fc.oneof(arbSafeParamValue, fc.stringMatching(/^v\d{1,6}$/)), {
    minLength: 1,
    maxLength: 3,
  })
  .map((segs) => segs.join("/"));

describe("free-generator totality + path-fixpoint (#1288)", () => {
  test.prop([arbFreeSplat], { numRuns: NUM_RUNS.standard })(
    "constrained-opt→splat: EVERY built omit form matches and path-fixpoints",
    (rest) => {
      const m = matcherFor(versioned());
      const url = m.buildPath("r", { rest });
      const result = m.match(url);

      expect(result, `"${url}" did not match`).toBeDefined();
      expect(m.buildPath("r", result!.params)).toBe(url);
    },
  );

  test.prop([arbFreeSplat], { numRuns: NUM_RUNS.standard })(
    "catch-all next to a param+splat sibling: EVERY built catch-all URL matches",
    (rest) => {
      const m = catchAllMatcher();
      const url = m.buildPath("all", { rest });
      const result = m.match(url);

      expect(result, `"${url}" did not match`).toBeDefined();

      // path-fixpoint (#18) rebuilds via the MATCHED route — a colliding URL
      // (version-looking first segment) canonicalizes to the `ver` reading.
      const winner = result!.segments.at(-1)!.name;

      expect(m.buildPath(winner, result!.params)).toBe(url);
    },
  );
});

/**
 * #1288 deep constraint dead-end (D2): a constraint BELOW the junction failing
 * must fall back to the catch-all, not kill the whole match — the branch commits
 * only when the REACHED route's constraints hold.
 */
describe("deep constraint dead-end falls to the catch-all (#1288)", () => {
  const deep = () => [
    createInputNode({ name: "all", path: "/*rest", fullName: "all" }),
    createInputNode({
      name: "ver",
      path: String.raw`/:v<v\d+>/:id<\d+>`,
      fullName: "ver",
    }),
  ];

  test.prop([fc.stringMatching(/^v\d{1,6}$/), fc.stringMatching(/^\d{1,6}$/)], {
    numRuns: NUM_RUNS.standard,
  })("both constraints holding resolve to the specific route", (s1, s2) => {
    const m = createTestMatcher();

    m.registerTree(createRootWithChildren(deep()));

    const result = m.match(`/${s1}/${s2}`);

    expect(result?.segments.at(-1)?.name).toBe("ver");
    expect(result?.params).toStrictEqual({ v: s1, id: s2 });
  });

  test.prop(
    [
      fc
        .tuple(arbSafeParamValue, arbSafeParamValue)
        .filter(([s1, s2]) => !/^v\d+$/.test(s1) || !/^\d+$/.test(s2)),
    ],
    { numRuns: NUM_RUNS.standard },
  )("any constraint failing anywhere falls to the catch-all", ([s1, s2]) => {
    const m = createTestMatcher();

    m.registerTree(createRootWithChildren(deep()));

    const result = m.match(`/${s1}/${s2}`);

    expect(result, `"/${s1}/${s2}" did not match`).toBeDefined();
    expect(result!.segments.at(-1)?.name).toBe("all");
    expect(result!.params).toStrictEqual({ rest: `${s1}/${s2}` });
  });
});
