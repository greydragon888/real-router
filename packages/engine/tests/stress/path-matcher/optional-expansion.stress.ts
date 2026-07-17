import { describe, expect, it } from "vitest";

import { buildParamMeta } from "../../../src/path-matcher/buildParamMeta";
import { createTestMatcher } from "../../helpers/createTestMatcher";

import type { MatcherInputNode } from "../../../src/path-matcher/types";

/**
 * Scale guard for the optional-param registration fix (#849).
 *
 * `insertIntoTrieFrom` forks into a "take the param" and a "skip the param"
 * branch at every optional segment. Those branches converge on the same
 * `(node, start)` pairs across consecutive optionals, so WITHOUT memoization the
 * registration work is O(2^N) for N consecutive optionals (the trie itself stays
 * small — only the work explodes). The fix records visited `(node, start)` pairs
 * and skips repeats, collapsing the fan-out to polynomial.
 *
 * These assert what coverage cannot:
 *
 * 1. **Anti-exponential registration** — a route with many consecutive optionals
 *    registers in milliseconds. The discriminating signal is wall-time: with the
 *    memo removed, K=26 takes ~7-8 s (and grows ×2 per added optional), so the
 *    sub-second ceiling fails. Measured healthy is ~1 ms → the 500 ms ceiling
 *    sits ~500× above healthy and ~15× below the broken signal (anchored to a
 *    measured 2^N curve: N=22 ≈ 475 ms, doubling per N), so it discriminates and
 *    does not flake under CPU load.
 * 2. **Correctness survives the memoization** — skipping revisited `(node,start)`
 *    pairs must not drop any path: every presence-prefix of the optionals still
 *    matches and prefix-fills the slots (the established left-to-right semantics).
 */

function createInputNode(
  overrides: Partial<MatcherInputNode> & { name: string; path: string },
): MatcherInputNode {
  const paramMeta = buildParamMeta(overrides.path);

  return {
    fullName: overrides.name,
    absolute: false,
    children: new Map<string, MatcherInputNode>(),
    nonAbsoluteChildren: [],
    paramMeta,
    paramTypeMap: paramMeta.paramTypeMap,
    ...overrides,
  };
}

function createRoot(children: MatcherInputNode[]): MatcherInputNode {
  return createInputNode({
    name: "",
    path: "",
    fullName: "",
    children: new Map(children.map((c) => [c.fullName, c])),
    nonAbsoluteChildren: children,
  });
}

/** Builds `/x/:p1?/:p2?/.../:pK?` as a single route path. */
function optionalRoute(k: number): string {
  let path = "/x";

  for (let i = 1; i <= k; i++) {
    path += `/:p${i}?`;
  }

  return path;
}

describe("S1: many consecutive optional params register in sub-second time", () => {
  // K is chosen so the BROKEN (pre-#849, O(2^N)) path is unambiguously slow
  // (~7-8 s) while the fixed path stays ~1 ms — a ~500× margin under the ceiling.
  const K = 26;

  it(`registers a route with ${K} consecutive optional params without exponential blowup`, () => {
    const matcher = createTestMatcher();

    const route = createInputNode({
      name: "deep",
      path: optionalRoute(K),
      fullName: "deep",
    });

    const start = performance.now();

    matcher.registerTree(createRoot([route]));

    const registerMs = performance.now() - start;

    // Sanity: the route is usable (zero-optionals form matches).
    expect(matcher.match("/x")?.segments.at(-1)?.fullName).toBe("deep");

    // Healthy ~1 ms; pre-fix O(2^26) ≈ 7-8 s → this ceiling fails. Generous to
    // avoid CPU-load flake (the real signal is exponential, not micro-timing).
    expect(registerMs).toBeLessThan(500);
  });
});

describe("S2: memoization preserves correctness across optional presence-prefixes", () => {
  const K = 14;

  it(`prefix-fills the slots for every presence-prefix of ${K} optionals`, () => {
    const matcher = createTestMatcher();

    matcher.registerTree(
      createRoot([
        createInputNode({
          name: "deep",
          path: optionalRoute(K),
          fullName: "deep",
        }),
      ]),
    );

    // Providing j segments fills p1..pj left-to-right (omitted optionals at the
    // tail). A dropped path (over-aggressive memo skip) would surface as an
    // unexpected `undefined` here.
    for (let j = 0; j <= K; j++) {
      let url = "/x";
      const expected: Record<string, string> = {};

      for (let i = 1; i <= j; i++) {
        url += `/v${i}`;
        expected[`p${i}`] = `v${i}`;
      }

      const result = matcher.match(url);

      expect(result?.segments.at(-1)?.fullName).toBe("deep");
      expect(result?.params).toStrictEqual(expected);
    }
  });
});
