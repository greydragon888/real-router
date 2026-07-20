import { fc, test } from "@fast-check/vitest";
import { createRouter } from "@real-router/core";
import { describe, expect } from "vitest";

import { getStaticPaths } from "@real-router/ssr-utils";

import { NUM_RUNS } from "./helpers";

import type { Route } from "@real-router/core";

/**
 * Model-based invariant for `getStaticPaths` (SSG leaf enumerator).
 *
 * INVARIANT: `getStaticPaths(router)` emits exactly the full-paths of the tree's
 * LEAF routes (a leaf = a node with no children), one per leaf — no dropped
 * leaf, no enumerated parent, no duplicate. (Leaf-only is the documented
 * contract: "enumerate leaf routes and build URLs for SSG pre-rendering".)
 *
 * ORACLE is model-based and independent of the code under test: a random tree
 * SHAPE is generated, then the expected set of leaf full-paths is computed
 * directly FROM THE SHAPE — never from `getStaticPaths`' own traversal. So a bug
 * in the leaf walk (drop, off-by-one `children.size` test, emitting parents)
 * makes the produced set diverge from the model.
 *
 * Static segments only: the property under test is leaf ENUMERATION (which
 * nodes, how many), not param encoding, so a trivial `/seg` path keeps the
 * model trivial and fully independent of `buildPath` internals. Set equality is
 * used for completeness/soundness (robust to the tree's internal child order);
 * length pins "exactly one path per leaf" (no duplicates).
 */

interface Shape {
  children: Shape[];
}

// Bounded recursive tree SHAPE (nesting only). Eager construction terminates
// because maxDepth strictly decreases; depth <= 4, breadth <= 3 → <= ~120 nodes.
function arbForest(maxDepth: number): fc.Arbitrary<Shape[]> {
  const node: fc.Arbitrary<Shape> =
    maxDepth <= 0
      ? fc.constant({ children: [] })
      : fc.record({ children: arbForest(maxDepth - 1) });

  return fc.array(node, { maxLength: 3 });
}

// Top-level forest with at least one route (an empty router is a different
// contract, out of scope here).
const arbTreeShape = fc.array(fc.record({ children: arbForest(3) }), {
  minLength: 1,
  maxLength: 3,
});

// Assign globally-unique segment names, build the Route[] AND the independently
// computed list of leaf full-paths (the oracle).
function materialize(shape: Shape[]): { routes: Route[]; leafPaths: string[] } {
  const leafPaths: string[] = [];
  let counter = 0;

  function build(nodes: Shape[], parentPath: string): Route[] {
    return nodes.map((node) => {
      const seg = `r${counter++}`;
      const fullPath = `${parentPath}/${seg}`;
      const route: Route = { name: seg, path: `/${seg}` };

      if (node.children.length > 0) {
        route.children = build(node.children, fullPath);
      } else {
        leafPaths.push(fullPath);
      }

      return route;
    });
  }

  return { routes: build(shape, ""), leafPaths };
}

describe("getStaticPaths Properties", () => {
  test.prop([arbTreeShape], { numRuns: NUM_RUNS.thorough })(
    "enumerates exactly the tree's leaf full-paths (model-based set oracle)",
    async (shape) => {
      const { routes, leafPaths } = materialize(shape);
      const router = createRouter(routes);

      const paths = await getStaticPaths(router);

      // Completeness + soundness: exactly the leaf paths — no dropped leaf, no
      // enumerated parent. Set equality is robust to internal child ordering.
      expect(new Set(paths)).toStrictEqual(new Set(leafPaths));
      // Exactly one path per leaf (no duplicates).
      expect(paths).toHaveLength(leafPaths.length);

      router.dispose();
    },
  );
});
