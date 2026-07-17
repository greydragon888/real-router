import { describe, expect, it } from "vitest";

import { buildParamMeta } from "../../../src/path-matcher/buildParamMeta";
import { createTestMatcher } from "../../helpers/createTestMatcher";

import type { MatcherInputNode } from "../../../src/path-matcher/types";

/**
 * Scale / throughput guards for the param-name conflict fix (#736).
 *
 * The fix adds a per-segment name check on the REGISTRATION path. These tests
 * assert two things that coverage cannot:
 *
 * 1. **Correctness at scale** — across thousands of routes that legitimately
 *    share a parametric position under one agreed name, the matcher never
 *    aliases a captured value to the wrong key. This is the property the bug
 *    violated; the discriminating signal is param-key identity, not heap size,
 *    so these are correctness-at-scale guards, not heap-threshold tests.
 * 2. **Conflict detection survives scale** — a single conflicting param name
 *    buried in a large tree is still caught (not lost in the breadth), and the
 *    check stays cheap (timing ceilings are generous to avoid CPU-load flake).
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

describe("S1: wide shared-param tree — no aliasing across thousands of routes", () => {
  const WIDTH = 5000;

  it(`registers ${WIDTH} routes sharing one ':id' position and captures every key correctly`, () => {
    const matcher = createTestMatcher();

    // root > u(/u) > user(/:id) > c0..cN(/c{j})  — all leaves reuse the SAME
    // ':id' trie position, exercising the "paramChild exists, same name" branch
    // WIDTH times.
    const leaves: MatcherInputNode[] = [];

    for (let j = 0; j < WIDTH; j++) {
      leaves.push(
        createInputNode({
          name: `c${j}`,
          path: `/c${j}`,
          fullName: `u.user.c${j}`,
        }),
      );
    }

    const idNode = createInputNode({
      name: "user",
      path: "/:id",
      fullName: "u.user",
      children: new Map(leaves.map((l) => [l.fullName, l])),
      nonAbsoluteChildren: leaves,
    });
    const uNode = createInputNode({
      name: "u",
      path: "/u",
      fullName: "u",
      children: new Map([["user", idNode]]),
      nonAbsoluteChildren: [idNode],
    });

    const start = performance.now();

    matcher.registerTree(createRoot([uNode]));

    const registerMs = performance.now() - start;

    // Correctness: a representative sample across the whole breadth must bind
    // the shared position under exactly 'id' — never a swapped or stale key.
    for (let j = 0; j < WIDTH; j += 137) {
      const result = matcher.match(`/u/val${j}/c${j}`);

      expect(result?.params).toStrictEqual({ id: `val${j}` });
      expect(result?.segments.at(-1)?.fullName).toBe(`u.user.c${j}`);
    }

    // The shallow route at the shared position also captures under 'id'.
    expect(matcher.match("/u/solo")?.params).toStrictEqual({ id: "solo" });

    // Catastrophe-guard (healthy ~20 ms, ≈90× margin): catches a severe /
    // super-linear registration blowup (e.g. a reintroduced exponential), not a
    // mild O(n²) — which at 5k sits under this ceiling. The no-aliasing
    // correctness sampled above is the precise #736 guard.
    expect(registerMs).toBeLessThan(2000);
  });
});

describe("S2: match throughput on shared-param tree is unaffected by the fix", () => {
  it("matches 50,000 times against a shared ':id' position with correct keys", () => {
    const matcher = createTestMatcher();

    const leaves: MatcherInputNode[] = [];

    for (let j = 0; j < 200; j++) {
      leaves.push(
        createInputNode({
          name: `c${j}`,
          path: `/c${j}`,
          fullName: `u.user.c${j}`,
        }),
      );
    }

    const idNode = createInputNode({
      name: "user",
      path: "/:id",
      fullName: "u.user",
      children: new Map(leaves.map((l) => [l.fullName, l])),
      nonAbsoluteChildren: leaves,
    });
    const uNode = createInputNode({
      name: "u",
      path: "/u",
      fullName: "u",
      children: new Map([["user", idNode]]),
      nonAbsoluteChildren: [idNode],
    });

    matcher.registerTree(createRoot([uNode]));

    const ITER = 50_000;
    const start = performance.now();
    let lastKey = "";

    for (let i = 0; i < ITER; i++) {
      const j = i % 200;
      const result = matcher.match(`/u/v${i}/c${j}`);

      // Touch the result so the loop can't be optimized away, and assert no
      // aliasing on every single iteration.
      lastKey = Object.keys(result!.params)[0];
    }

    const totalMs = performance.now() - start;

    expect(lastKey).toBe("id");
    // ~> hot path; generous per-op ceiling, correctness is the real guard.
    expect(totalMs / ITER).toBeLessThan(0.05);
  });
});

describe("S3: conflict detection survives a large tree", () => {
  it("catches a single conflicting ':slug' among thousands of valid ':id' siblings", () => {
    const matcher = createTestMatcher();

    const valid: MatcherInputNode[] = [];

    // 4000 valid siblings all agreeing on ':id' at /u/:id/...
    for (let j = 0; j < 4000; j++) {
      valid.push(
        createInputNode({
          name: `c${j}`,
          path: `/c${j}`,
          fullName: `u.user.c${j}`,
        }),
      );
    }

    const idNode = createInputNode({
      name: "user",
      path: "/:id",
      fullName: "u.user",
      children: new Map(valid.map((l) => [l.fullName, l])),
      nonAbsoluteChildren: valid,
    });

    // One rogue route reuses /u's param position under a different name.
    const rogue = createInputNode({
      name: "rogue",
      path: "/:slug",
      fullName: "u.rogue",
    });

    const uNode = createInputNode({
      name: "u",
      path: "/u",
      fullName: "u",
      children: new Map([
        ["user", idNode],
        ["rogue", rogue],
      ]),
      nonAbsoluteChildren: [idNode, rogue],
    });

    const start = performance.now();
    let caught: Error | undefined;

    try {
      matcher.registerTree(createRoot([uNode]));
    } catch (error) {
      caught = error as Error;
    }

    const elapsedMs = performance.now() - start;

    // The throw + message is the precise guard (mutation-validated: disabling
    // the #736 check makes `caught` undefined). The timing is a catastrophe-guard
    // that detection stays cheap at scale, not a micro-timing assert.
    expect(caught).toBeDefined();
    expect(caught?.message).toMatch(/Parameter name conflict/);
    expect(caught?.message).toMatch(/':id' and ':slug'/);
    expect(elapsedMs).toBeLessThan(2000);
  });
});
