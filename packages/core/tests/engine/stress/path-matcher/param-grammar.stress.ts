import { describe, expect, it } from "vitest";

import { buildParamMeta } from "../../../../src/engine/path-matcher/buildParamMeta";
import { createTestMatcher } from "../../helpers/createTestMatcher";

import type { MatcherInputNode } from "../../../../src/engine/path-matcher/types";

/**
 * Scale / throughput guards for the unified param grammar (#738).
 *
 * The fix derives the build-path name class from the same source as the
 * match-path class and builds `compileBuildParts`'s `paramRgx` via `new RegExp`
 * per registration. These tests assert what coverage cannot:
 *
 * 1. **Round-trip at scale** — across thousands of routes with diverse
 *    non-`\w` param names, every `match → buildPath` round-trip is stable; the
 *    discriminating signal is "did any name in the population fall out of grammar
 *    sync", which one example can't establish.
 * 2. **Registration throughput** — building a fresh `RegExp` per route must not
 *    introduce a perf cliff. Generous ceiling guards against accidental
 *    quadratic behavior, not micro-timing.
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

describe("S1: build/match round-trip holds across thousands of non-word names", () => {
  const WIDTH = 5000;
  // Rotating suffixes exercise the chars the old [\w]+ build grammar dropped.
  const SHAPES = ["plain", "with-hyphen", "with.dot", "with~tilde"];

  it(`registers ${WIDTH} hyphen/dot/tilde param routes and round-trips each`, () => {
    const matcher = createTestMatcher();

    const routes: MatcherInputNode[] = [];

    for (let i = 0; i < WIDTH; i++) {
      const paramName = `${SHAPES[i % SHAPES.length]}${i}`;

      routes.push(
        createInputNode({
          name: `r${i}`,
          path: `/seg${i}/:${paramName}`,
          fullName: `r${i}`,
        }),
      );
    }

    const start = performance.now();

    matcher.registerTree(createRoot(routes));

    const registerMs = performance.now() - start;

    // Sample across the whole population: match key must equal build key.
    for (let i = 0; i < WIDTH; i += 131) {
      const paramName = `${SHAPES[i % SHAPES.length]}${i}`;
      const value = `v${i}`;

      expect(matcher.match(`/seg${i}/${value}`)?.params).toStrictEqual({
        [paramName]: value,
      });
      expect(matcher.buildPath(`r${i}`, { [paramName]: value })).toBe(
        `/seg${i}/${value}`,
      );
    }

    // Catastrophe-guard (healthy ~20 ms, ≈100× margin): catches a severe
    // super-linear blowup in per-route RegExp construction, not a mild O(n²)
    // (under this ceiling at 5k). The build/match round-trip sampled above is
    // the precise #738 guard.
    expect(registerMs).toBeLessThan(2000);
  });
});

describe("S2: constraint-`?` routes register and validate at scale", () => {
  it("registers 3000 `<\\d?>`-constrained routes without metadata loss", () => {
    const matcher = createTestMatcher();

    const routes: MatcherInputNode[] = [];

    for (let i = 0; i < 3000; i++) {
      routes.push(
        createInputNode({
          name: `c${i}`,
          path: String.raw`/c${i}/:id<\d?>`,
          fullName: `c${i}`,
        }),
      );
    }

    matcher.registerTree(createRoot(routes));

    for (let i = 0; i < 3000; i += 97) {
      // Single digit satisfies \d?; build round-trips.
      expect(matcher.match(`/c${i}/7`)?.params).toStrictEqual({ id: "7" });
      expect(matcher.buildPath(`c${i}`, { id: "7" })).toBe(`/c${i}/7`);
      // Two digits violate the (preserved) constraint.
      expect(matcher.match(`/c${i}/77`)).toBeUndefined();
    }
  });
});
