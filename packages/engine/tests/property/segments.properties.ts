// packages/route-tree/tests/property/segments.properties.ts

import { test } from "@fast-check/vitest";

import { arbRouteForest, getSegmentsByName, NUM_RUNS } from "./helpers";
import { createRouteTree } from "../../src/builder/createRouteTree";

import type { RouteDefinition, RouteTree } from "../../src/types";

/**
 * getSegmentsByName invariants, generalized from the old fixed DEEP_TREE fixture
 * to random nested trees (`arbRouteForest`) — previously the lone fixed-fixture
 * holdout in the property suite. The oracle is the tree STRUCTURE itself: the
 * chain returned by getSegmentsByName (a Map-walk DOWN from the root) must equal
 * an independent walk UP the `parent` backrefs — a model-based cross-check of two
 * traversals, run over every node of thousands of shapes instead of 8 fixed names.
 */

// Every non-root node of the built tree (root is excluded — it is never queried).
function collectAllNodes(tree: RouteTree): RouteTree[] {
  const nodes: RouteTree[] = [];

  for (const child of tree.children.values()) {
    nodes.push(child, ...collectAllNodes(child));
  }

  return nodes;
}

// Independent oracle: the root→node chain reconstructed by walking `parent` links
// up, excluding the path-"" root (which getSegmentsByName also omits). Root-first.
function parentChain(node: RouteTree): RouteTree[] {
  const chain: RouteTree[] = [];
  let current: RouteTree = node;

  while (current.name !== "") {
    chain.unshift(current);

    if (!current.parent) {
      break;
    }

    current = current.parent;
  }

  return chain;
}

describe("getSegmentsByName Properties (generative, over arbRouteForest)", () => {
  describe("chain fidelity — returned segments equal the independent parent-walk (high)", () => {
    test.prop([arbRouteForest], { numRuns: NUM_RUNS.standard })(
      "getSegmentsByName(tree, node.fullName) is the exact root→node chain for every node",
      (routes: RouteDefinition[]) => {
        const tree = createRouteTree("", "", routes);

        for (const node of collectAllNodes(tree)) {
          const segments = getSegmentsByName(tree, node.fullName);

          expect(segments).not.toBeNull();

          // Model-based cross-check: the Map-walk-down chain equals the
          // parent-walk-up chain. One assertion subsumes correctness (last node),
          // the prefix property, and the fullName-chain invariant.
          expect(segments!.map((s) => s.fullName)).toStrictEqual(
            parentChain(node).map((n) => n.fullName),
          );
          expect(segments!.at(-1)).toBe(node);
        }
      },
    );
  });

  describe("length — segment count equals dot-segment count (high)", () => {
    test.prop([arbRouteForest], { numRuns: NUM_RUNS.standard })(
      "segments.length === node.fullName.split('.').length for every node",
      (routes: RouteDefinition[]) => {
        const tree = createRouteTree("", "", routes);

        for (const node of collectAllNodes(tree)) {
          const segments = getSegmentsByName(tree, node.fullName);

          expect(segments).not.toBeNull();
          expect(segments!).toHaveLength(node.fullName.split(".").length);
        }
      },
    );
  });

  describe("null on unknown — an absent name yields null (high)", () => {
    test.prop([arbRouteForest], { numRuns: NUM_RUNS.standard })(
      "a real name extended with a non-existent child segment, and a bogus name, return null",
      (routes: RouteDefinition[]) => {
        const tree = createRouteTree("", "", routes);

        // Names are always n0/n1/… so the "zzz" segment is never present: this
        // walks the existing prefix, then misses — the partial-walk null branch.
        for (const node of collectAllNodes(tree)) {
          expect(getSegmentsByName(tree, `${node.fullName}.zzz`)).toBeNull();
        }

        // A wholly-unknown top-level name hits the first-lookup null branch.
        expect(getSegmentsByName(tree, "____absent____")).toBeNull();
      },
    );
  });
});
