// packages/route-tree/tests/property/tree.properties.ts

import { fc, test } from "@fast-check/vitest";

import { arbRouteForest, NUM_RUNS } from "./helpers";
import { createRouteTree } from "../../../src/engine/builder/createRouteTree";
import { createMatcher } from "../../../src/engine/createMatcher";
import {
  nodeToDefinition,
  routeTreeToDefinitions,
} from "../../../src/engine/operations/routeTreeToDefinitions";

import type { RouteDefinition, RouteTree } from "../../../src/engine/types";

// =============================================================================
// Fixed nested+absolute pool — retained for N4's explicit per-node absolute-flag
// roundtrip check (arbRouteForest covers structure generatively elsewhere).
// =============================================================================

const ABSOLUTE_PARENT_POOL: RouteDefinition[] = [
  {
    name: "app",
    path: "/app",
    children: [
      { name: "dashboard", path: "~/dashboard" },
      { name: "metrics", path: "/metrics" },
    ],
  },
  {
    name: "portal",
    path: "/portal",
    children: [{ name: "admin", path: "~/admin" }],
  },
  {
    name: "site",
    path: "/site",
    children: [
      { name: "home", path: "~/home" },
      { name: "about", path: "~/about" },
    ],
  },
  {
    name: "base",
    path: "/base",
    children: [
      { name: "root", path: "~/root" },
      { name: "nested", path: "/nested" },
      { name: "top", path: "~/top" },
    ],
  },
];

// =============================================================================
// Helpers
// =============================================================================

function collectAllNodes(tree: RouteTree): RouteTree[] {
  const nodes: RouteTree[] = [];

  for (const child of tree.children.values()) {
    nodes.push(child, ...collectAllNodes(child));
  }

  return nodes;
}

function countDefs(defs: readonly RouteDefinition[]): number {
  return defs.reduce(
    (acc, def) => acc + 1 + (def.children ? countDefs(def.children) : 0),
    0,
  );
}

// =============================================================================
// Tests
// =============================================================================

describe("createRouteTree Properties", () => {
  describe("1: idempotency — build→extract→build preserves the full nested structure (high)", () => {
    test.prop([arbRouteForest], { numRuns: NUM_RUNS.standard })(
      "routeTreeToDefinitions ∘ createRouteTree is a faithful, idempotent roundtrip over arbitrary nested trees",
      (routes: RouteDefinition[]) => {
        const defs1 = routeTreeToDefinitions(createRouteTree("", "", routes));
        const defs2 = routeTreeToDefinitions(createRouteTree("", "", defs1));

        // Full fidelity: extracting the built tree reproduces the input exactly
        // (names, paths incl. `~`/params/query/splat, nesting, child order).
        expect(defs1).toStrictEqual(routes);
        // Idempotent: a second roundtrip is a fixed point.
        expect(defs2).toStrictEqual(defs1);
      },
    );
  });

  describe("2: preservation — createRouteTree keeps every route at every level (high)", () => {
    test.prop([arbRouteForest], { numRuns: NUM_RUNS.standard })(
      "no route is dropped: top-level count and total node count both match the input",
      (routes: RouteDefinition[]) => {
        const tree = createRouteTree("", "", routes);

        expect(tree.children.size).toBe(routes.length);
        expect(collectAllNodes(tree)).toHaveLength(countDefs(routes));
      },
    );
  });

  describe("3: normalization — absolute path marker stripped after tree build (high)", () => {
    test.prop([arbRouteForest], { numRuns: NUM_RUNS.standard })(
      "no node anywhere in the built tree has a path starting with ~",
      (routes: RouteDefinition[]) => {
        for (const node of collectAllNodes(createRouteTree("", "", routes))) {
          expect(node.path.startsWith("~")).toBe(false);
        }
      },
    );
  });

  describe("4: absolute roundtrip — ~ stripped in tree and restored in definitions (high)", () => {
    test.prop([fc.subarray(ABSOLUTE_PARENT_POOL, { minLength: 1 })], {
      numRuns: NUM_RUNS.standard,
    })(
      "absolute flag and path survive build→extract→rebuild cycle",
      (routes: RouteDefinition[]) => {
        const tree = createRouteTree("", "", routes);
        const allNodes = collectAllNodes(tree);

        for (const node of allNodes) {
          expect(node.path.startsWith("~")).toBe(false);
        }

        const extracted = routeTreeToDefinitions(tree);
        const rebuilt = createRouteTree("", "", extracted);
        const rebuiltNodes = collectAllNodes(rebuilt);

        expect(rebuiltNodes).toHaveLength(allNodes.length);

        for (const node of allNodes) {
          const match = rebuiltNodes.find((n) => n.fullName === node.fullName);

          expect(match).toBeDefined();
          expect(match!.absolute).toBe(node.absolute);
          expect(match!.path).toBe(node.path);
        }
      },
    );
  });

  // #1407: `createNode` prepends a missing leading "/" (after the `~`-strip), so
  // the trie never sees a bare relative segment. All four spellings of an absolute
  // single segment — relative `s`, `/s`, `~s`, `~/s` — collapse to the stored path
  // `/s` and round-trip through the matcher. (arbRouteForest only generates
  // leading-`/`/`~/` forms, so this slash-less space is otherwise untested.)
  describe("5: leading-slash normalization — a slash-less path is prepended with / (#1407)", () => {
    const arbSeg = fc.stringMatching(/^[a-z][a-z0-9]{0,7}$/);
    // The four spellings of an absolute single segment, by their path prefix:
    // relative `s`, absolute `/s`, tilde-no-slash `~s`, tilde-slash `~/s`.
    const arbPrefix = fc.constantFrom("", "/", "~", "~/");

    test.prop([arbSeg, arbPrefix], { numRuns: NUM_RUNS.standard })(
      "every spelling of an absolute single segment stores path `/s` and round-trips",
      (seg: string, prefix: string) => {
        const tree = createRouteTree("", "", [
          { name: "r", path: `${prefix}${seg}` },
        ]);
        const node = collectAllNodes(tree)[0];

        // The stored path is always leading-"/" — the trie only ever sees a
        // leading-"/" path (the "correct-by-construction" invariant #1407).
        expect(node.path).toBe(`/${seg}`);

        const matcher = createMatcher();

        matcher.registerTree(tree);

        expect(matcher.buildPath("r", {})).toBe(`/${seg}`);
        expect(matcher.match(`/${seg}`)?.segments.at(-1)?.name).toBe("r");
      },
    );
  });
});

// =============================================================================
// Computed Cache Properties
// =============================================================================

describe("Computed Cache Properties", () => {
  describe("immutability — every node and its caches are frozen, over arbitrary shapes (high)", () => {
    test.prop([arbRouteForest], { numRuns: NUM_RUNS.standard })(
      "every node + children Map + paramTypeMap + nonAbsoluteChildren + paramMeta arrays pass Object.isFrozen",
      (routes: RouteDefinition[]) => {
        const tree = createRouteTree("", "", routes);

        for (const node of [tree, ...collectAllNodes(tree)]) {
          expect(Object.isFrozen(node)).toBe(true);
          expect(Object.isFrozen(node.children)).toBe(true);
          expect(Object.isFrozen(node.paramTypeMap)).toBe(true);
          expect(Object.isFrozen(node.nonAbsoluteChildren)).toBe(true);
          // CC1 also covers the nested paramMeta object and its arrays (#747).
          // (paramMeta carries no constraintPatterns Map — the path grammar
          // has no regex constraints.)
          expect(Object.isFrozen(node.paramMeta)).toBe(true);
          expect(Object.isFrozen(node.paramMeta.urlParams)).toBe(true);
          expect(Object.isFrozen(node.paramMeta.queryParams)).toBe(true);
          expect(Object.isFrozen(node.paramMeta.spatParams)).toBe(true);
        }
      },
    );
  });

  describe("nonAbsoluteChildren — excludes the absolute children IN DEFINITION ORDER, over arbitrary shapes (high)", () => {
    test.prop([arbRouteForest], { numRuns: NUM_RUNS.standard })(
      "nonAbsoluteChildren equals children.values().filter(!absolute) as an ORDERED sequence at every node",
      (routes: RouteDefinition[]) => {
        const tree = createRouteTree("", "", routes);

        for (const node of [tree, ...collectAllNodes(tree)]) {
          const expected = [...node.children.values()].filter(
            (c) => !c.absolute,
          );

          // Ordered equality (definition order), not bare membership — `toContain`
          // passes a reordering bug. Compare by fullName to sidestep circular
          // equality through each node's `parent` backref.
          expect(node.nonAbsoluteChildren.map((c) => c.fullName)).toStrictEqual(
            expected.map((c) => c.fullName),
          );
        }
      },
    );
  });

  describe("paramTypeMap classification — URL/splat typed 'url', query typed 'query' (high)", () => {
    const arbParamName = fc.stringMatching(/^[a-zA-Z_]\w{0,8}$/);

    // url params, query params, and 0–1 splat param — all names globally unique.
    const arbParamGroups = fc
      .tuple(
        fc.array(arbParamName, { minLength: 0, maxLength: 3 }),
        fc.array(arbParamName, { minLength: 0, maxLength: 3 }),
        fc.array(arbParamName, { minLength: 0, maxLength: 1 }),
      )
      .filter(([urls, queries, splats]) => {
        const all = [...urls, ...queries, ...splats];

        return all.length > 0 && new Set(all).size === all.length;
      });

    test.prop([arbParamGroups], { numRuns: NUM_RUNS.standard })(
      "every URL/splat param is typed 'url' (splat also in spatParams) and every query param is typed 'query'",
      ([urlParams, queryParams, splatParams]: [
        string[],
        string[],
        string[],
      ]) => {
        const urlSegments = urlParams.map((p) => `/:${p}`).join("");
        const splatSegments = splatParams.map((p) => `/*${p}`).join("");
        const queryString =
          queryParams.length > 0 ? `?${queryParams.join("&")}` : "";
        const path = `/base${urlSegments}${splatSegments}${queryString}`;

        const tree = createRouteTree("", "", [{ name: "test", path }]);
        const node = tree.children.get("test")!;

        for (const p of urlParams) {
          expect(node.paramTypeMap[p]).toBe("url");
        }

        for (const s of splatParams) {
          expect(node.paramTypeMap[s]).toBe("url");
          expect(node.paramMeta.spatParams).toContain(s);
        }

        for (const q of queryParams) {
          expect(node.paramTypeMap[q]).toBe("query");
        }

        expect(Object.keys(node.paramTypeMap)).toHaveLength(
          urlParams.length + splatParams.length + queryParams.length,
        );
      },
    );
  });

  describe("fullName — equals dot-joined ancestor chain at every node, over arbitrary shapes (high)", () => {
    test.prop([arbRouteForest], { numRuns: NUM_RUNS.standard })(
      "every node's fullName is the dot-joined chain of names from the root to it",
      (routes: RouteDefinition[]) => {
        const tree = createRouteTree("", "", routes);

        for (const node of collectAllNodes(tree)) {
          const parts: string[] = [];
          let current: RouteTree = node;

          while (current.name !== "") {
            parts.unshift(current.name);

            if (!current.parent) {
              break;
            }

            current = current.parent;
          }

          expect(node.fullName).toBe(parts.join("."));
        }
      },
    );
  });
});

// =============================================================================
// nodeToDefinition Properties
// =============================================================================

describe("nodeToDefinition Properties", () => {
  describe("absolute restoration — absolute flag maps to ~ prefix in output, over arbitrary shapes (high)", () => {
    test.prop([arbRouteForest], { numRuns: NUM_RUNS.standard })(
      "nodeToDefinition output path has ~ prefix iff node.absolute is true",
      (routes: RouteDefinition[]) => {
        const tree = createRouteTree("", "", routes);

        for (const node of collectAllNodes(tree)) {
          const def = nodeToDefinition(node);

          if (node.absolute) {
            expect(def.path.startsWith("~")).toBe(true);
            expect(def.path.slice(1)).toBe(node.path);
          } else {
            expect(def.path.startsWith("~")).toBe(false);
            expect(def.path).toBe(node.path);
          }
        }
      },
    );
  });
});
