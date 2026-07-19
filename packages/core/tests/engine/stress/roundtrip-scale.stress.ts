import { describe, expect, it } from "vitest";

import { createRouteTree } from "../../../src/engine/builder/createRouteTree";
import { routeTreeToDefinitions } from "../../../src/engine/operations/routeTreeToDefinitions";

import type { RouteDefinition, RouteTree } from "../../../src/engine/types";

/**
 * Scale guards for `routeTreeToDefinitions` (tree → definitions), the recursive
 * inverse of `createRouteTree` used by `cloneRouter` and route introspection. It
 * runs on every SSR clone, so its scale behaviour is on a real hot path.
 *
 * No heap assertions (same GC-masking reasoning as build-scale) and no wall-clock
 * timing (serialize is O(n) with no quadratic target — a timing bound would be
 * theatre, see build-scale header). The signal is structural fidelity at scale:
 * the functional/property suites prove round-trip correctness on small trees;
 * these add the breadth + recursion-depth dimensions those cannot.
 */

const SIBLINGS = 10_000;

describe("S3: round-trip — serialize + rebuild preserves structure at scale", () => {
  it(`round-trips ${SIBLINGS} routes with no structural drift`, () => {
    const routes: RouteDefinition[] = Array.from(
      { length: SIBLINGS },
      (_, i) => ({ name: `r${i}`, path: `/r${i}` }),
    );
    const tree = createRouteTree("", "", routes);

    const defs = routeTreeToDefinitions(tree);
    const rebuilt = createRouteTree("", "", defs);

    expect(defs).toHaveLength(SIBLINGS);
    expect(rebuilt.children.size).toBe(SIBLINGS);

    // Sample fidelity: a node dropped or a path/name corrupted by the recursive
    // nodeToDefinition surfaces here, not in a "did it run" check.
    for (let i = 0; i < SIBLINGS; i += 131) {
      expect(rebuilt.children.get(`r${i}`)?.path).toBe(`/r${i}`);
    }
  });

  // Separate recursion cliff from build-scale's S2: routeTreeToDefinitions'
  // `nodeToDefinition` is a DIFFERENT recursive function and could overflow at a
  // different depth. Guards that serializing a realistic-deep tree does not throw
  // RangeError and stays structurally faithful. DEPTH=1000 is conservative for
  // the env-sensitive forks-pool stack cliff (~2–4k) — see build-scale S2.
  const DEPTH = 1000;

  it(`serializes a ${DEPTH}-level deep tree without stack overflow`, () => {
    let def: RouteDefinition = {
      name: `n${DEPTH - 1}`,
      path: `/s${DEPTH - 1}`,
    };

    for (let i = DEPTH - 2; i >= 0; i--) {
      def = { name: `n${i}`, path: `/s${i}`, children: [def] };
    }

    const tree = createRouteTree("", "", [def]);
    const defs = routeTreeToDefinitions(tree);

    // Walk the serialized definitions back down to the leaf — proves all DEPTH
    // levels round-tripped through the recursive serializer.
    let current: RouteDefinition = defs[0];
    let level = 0;

    while (current.children?.length) {
      const [child] = current.children;

      current = child;
      level++;
    }

    expect(level).toBe(DEPTH - 1);
    expect(current.name).toBe(`n${DEPTH - 1}`);

    // Rebuild from the serialized form to confirm the round-trip is buildable.
    const rebuilt: RouteTree = createRouteTree("", "", defs);

    expect(rebuilt.children.get("n0")?.name).toBe("n0");
  });
});
