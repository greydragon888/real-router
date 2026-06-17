import { describe, expect, it } from "vitest";

import { createRouteTree } from "../../src/builder/createRouteTree";

import type { RouteDefinition, RouteTree } from "../../src/types";

/**
 * Scale / robustness guards for the route-tree BUILD pipeline
 * (`createRouteTree` → buildTree → computeCaches). This pipeline runs on EVERY
 * route mutation (add/remove/replace/clear/setRootPath) and every clone in core,
 * yet path-matcher's stress suite covers only the MATCH side (via its own inline
 * buildTree), so the real build pipeline has no scale coverage.
 *
 * Deliberately NO heap-delta assertions: `createRouteTree` builds a frozen tree
 * that the caller discards on the next rebuild, so old trees are GC'd regardless
 * of correctness. A "build N trees, assert heap bounded" test would be GC-masked
 * theatre (see CLAUDE.md stress-test doctrine). The discriminating signals here
 * are timing-anchored-to-measured-healthy plus structural correctness at scale.
 */

const SIBLINGS = 10_000;
// Measured healthy build of 10k siblings ≈ 6 ms. Ceiling is a catastrophe guard
// (~170×): a superlinear regression in the build (e.g. an O(n) scan per node
// turning the whole build O(n²)) pushes 10k routes into hundreds of ms / seconds.
// Generous margin tolerates CPU-load jitter without flaking.
const BUILD_MS_CEILING = 1000;

describe("S1: wide build — 10k sibling routes build correctly and cheaply", () => {
  it(`builds ${SIBLINGS} siblings under ${BUILD_MS_CEILING}ms with no dropped routes`, () => {
    const routes: RouteDefinition[] = Array.from(
      { length: SIBLINGS },
      (_, i) => ({ name: `r${i}`, path: `/r${i}` }),
    );

    const t0 = performance.now();
    const tree = createRouteTree("", "", routes);
    const buildMs = performance.now() - t0;

    expect(tree.children.size).toBe(SIBLINGS);

    // Sample every 131st route: a drop or key corruption in the build (wrong Map
    // key, lost node) surfaces here — not in a "did it run to completion" check.
    for (let i = 0; i < SIBLINGS; i += 131) {
      const node = tree.children.get(`r${i}`);

      expect(node?.path).toBe(`/r${i}`);
      expect(node?.fullName).toBe(`r${i}`);
    }

    expect(buildMs).toBeLessThan(BUILD_MS_CEILING);
  });
});

const DEPTH = 1000;
// The recursion cliff (`RangeError: Maximum call stack`) is strongly
// environment-sensitive: ~9–10k levels under the default test runner, but only
// ~2–4k under the stress `forks` pool (a forked process gets a smaller default
// stack, and the build recurses ~2 frames/level via buildTree's createNode AND
// computeCaches' processNode). So the cliff is NOT asserted; DEPTH=1000 sits
// comfortably below the forks cliff (confirmed OK at 2000) for non-flaky margin,
// and is still ~50× deeper than any realistic route tree.
//
// Discriminates: a refactor that adds recursion frames per level lowers the cliff
// below 1000 → the build throws RangeError here. Build time stays ~linear in
// depth (V8 cons-strings keep `parent.fullName + "." + name` O(1) per node), so
// the ms ceiling is a loose anti-catastrophe bound only — the primary guard is
// "no premature stack overflow + all levels processed".
const DEEP_BUILD_MS_CEILING = 500;

describe("S2: deep nesting — realistic-deep tree builds without stack overflow", () => {
  it(`builds a ${DEPTH}-level linear nesting without RangeError`, () => {
    // Build the deep definition iteratively (leaf → root) so constructing the
    // INPUT never recurses; only createRouteTree's own recursion is exercised.
    let def: RouteDefinition = {
      name: `n${DEPTH - 1}`,
      path: `/s${DEPTH - 1}`,
    };

    for (let i = DEPTH - 2; i >= 0; i--) {
      def = { name: `n${i}`, path: `/s${i}`, children: [def] };
    }

    const t0 = performance.now();
    const tree = createRouteTree("", "", [def]);
    const buildMs = performance.now() - t0;

    // Walk to the deepest node; assert all DEPTH levels were processed (not
    // silently truncated). Reaching n{DEPTH-1} proves the recursion ran full.
    let node: RouteTree | undefined = tree.children.get("n0");
    let level = 0;

    while (node && node.children.size > 0) {
      node = node.children.get(`n${level + 1}`);
      level++;
    }

    expect(level).toBe(DEPTH - 1);
    expect(node?.name).toBe(`n${DEPTH - 1}`);

    expect(buildMs).toBeLessThan(DEEP_BUILD_MS_CEILING);
  });
});
