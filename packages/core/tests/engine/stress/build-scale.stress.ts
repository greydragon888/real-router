import { describe, expect, it } from "vitest";

import { createRouteTree } from "../../../src/engine/builder/createRouteTree";

import type { RouteDefinition, RouteTree } from "../../../src/engine/types";

/**
 * Scale / robustness guards for the route-tree BUILD pipeline
 * (`createRouteTree` → buildTree → computeCaches). This pipeline runs on EVERY
 * route mutation (add/remove/replace/clear/setRootPath) and every clone in core,
 * yet path-matcher's stress suite covers only the MATCH side (via its own inline
 * buildTree), so the real build pipeline has no scale coverage.
 *
 * Two deliberate omissions, both verified by mutation during the stress audit:
 *  - NO heap-delta assertions: `createRouteTree` builds a frozen tree the caller
 *    discards on the next rebuild, so old trees are GC'd regardless of cleanup →
 *    a "build N trees, assert heap bounded" test is GC-masked theatre.
 *  - NO wall-clock timing assertions: the build is structurally O(n) with no
 *    quadratic-prone hot spot. A 100M-op O(n²) regression injected into buildTree
 *    stayed UNDER a 1 s ceiling at 10k routes, so any non-flaky timing bound here
 *    would be theatre. (The one genuine anti-quadratic timing guard lives in
 *    validate-scale.stress.ts, where dup detection has a real Set-vs-array target.)
 *
 * The discriminating signal here is structural correctness at scale (no dropped
 * or corrupted nodes) plus recursion-depth robustness (no premature overflow).
 */

const SIBLINGS = 10_000;

describe("S1: wide build — 10k sibling routes build correctly at scale", () => {
  it(`builds ${SIBLINGS} siblings with no dropped or corrupted routes`, () => {
    const routes: RouteDefinition[] = Array.from(
      { length: SIBLINGS },
      (_, i) => ({ name: `r${i}`, path: `/r${i}` }),
    );

    const tree = createRouteTree("", "", routes);

    expect(tree.children.size).toBe(SIBLINGS);

    // Sample every 131st route: a drop or key corruption in the build (wrong Map
    // key, lost node) surfaces here — not in a "did it run to completion" check.
    for (let i = 0; i < SIBLINGS; i += 131) {
      const node = tree.children.get(`r${i}`);

      expect(node?.path).toBe(`/r${i}`);
      expect(node?.fullName).toBe(`r${i}`);
    }
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
// Discriminates two ways (both mutation-verified): a refactor that adds recursion
// frames per level lowers the cliff below 1000 → the build throws RangeError
// here; and a truncation bug that stops recursing early → the level walk below
// reaches < DEPTH-1. No timing assertion — build time is ~linear in depth (V8
// cons-strings keep `parent.fullName + "." + name` O(1) per node), so a ms ceiling
// would guard nothing real.

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

    const tree = createRouteTree("", "", [def]);

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
  });
});
