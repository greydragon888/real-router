// packages/route-tree/tests/property/tree.properties.ts

import { fc, test } from "@fast-check/vitest";

import {
  ABSOLUTE_PATH_TREE,
  arbDeepTreeRouteName,
  DEEP_TREE,
  MIXED_ABSOLUTE_TREE,
  MIXED_TREE,
  NUM_RUNS,
  PARAM_TREE,
  QUERY_TREE,
} from "./helpers";
import { createRouteTree } from "../../src/builder/createRouteTree";
import {
  nodeToDefinition,
  routeTreeToDefinitions,
} from "../../src/operations/routeTreeToDefinitions";

import type { RouteDefinition, RouteTree } from "../../src/types";

// =============================================================================
// Fixed route pool (all unique names and paths — no conflicts)
// =============================================================================

const ROUTE_POOL: RouteDefinition[] = [
  { name: "home", path: "/" },
  { name: "about", path: "/about" },
  { name: "users", path: "/users" },
  { name: "docs", path: "/docs" },
  { name: "blog", path: "/blog" },
  { name: "contact", path: "/contact" },
  { name: "faq", path: "/faq" },
  { name: "news", path: "/news" },
];

const arbRouteCount = fc.integer({ min: 3, max: ROUTE_POOL.length });

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

function extractStructure(tree: RouteTree): { name: string; path: string }[] {
  return routeTreeToDefinitions(tree).map((def) => ({
    name: def.name,
    path: def.path,
  }));
}

function collectAllNodes(tree: RouteTree): RouteTree[] {
  const nodes: RouteTree[] = [];

  for (const child of tree.children.values()) {
    nodes.push(child, ...collectAllNodes(child));
  }

  return nodes;
}

function hasParamsInChain(node: RouteTree): boolean {
  let current: RouteTree | null = node;

  while (current !== null && current.path !== "") {
    if (Object.keys(current.paramTypeMap).length > 0) {
      return true;
    }

    current = current.parent;
  }

  return false;
}

// =============================================================================
// Tests
// =============================================================================

describe("createRouteTree Properties", () => {
  describe("1: idempotency — building from extracted definitions gives same structure (high)", () => {
    test.prop([arbRouteCount], { numRuns: NUM_RUNS.standard })(
      "routeTreeToDefinitions(createRouteTree(routes)) roundtrips correctly",
      (count: number) => {
        const routes = ROUTE_POOL.slice(0, count);
        const tree1 = createRouteTree("", "", routes);
        const extracted = routeTreeToDefinitions(tree1);
        const tree2 = createRouteTree("", "", extracted);

        expect(extractStructure(tree1)).toStrictEqual(extractStructure(tree2));
        expect(tree2.children.size).toBe(tree1.children.size);
      },
    );
  });

  describe("2: preservation — createRouteTree keeps all top-level routes (high)", () => {
    test.prop([arbRouteCount], { numRuns: NUM_RUNS.standard })(
      "tree.children.size equals the number of routes passed",
      (count: number) => {
        const routes = ROUTE_POOL.slice(0, count);
        const tree = createRouteTree("", "", routes);

        expect(tree.children.size).toBe(count);
      },
    );
  });

  describe("3: normalization — absolute path marker stripped after tree build (medium)", () => {
    test.prop([fc.constant(ABSOLUTE_PATH_TREE)], { numRuns: NUM_RUNS.fast })(
      "no node in the tree has a path starting with ~",
      (tree: RouteTree) => {
        const allNodes = collectAllNodes(tree);

        for (const node of allNodes) {
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
});

// =============================================================================
// Computed Cache Properties
// =============================================================================

describe("Computed Cache Properties", () => {
  const deepTreeNodesByName = new Map(
    collectAllNodes(DEEP_TREE).map((n) => [n.fullName, n]),
  );

  describe("staticPath — non-null iff route and all ancestors have zero params (high)", () => {
    test.prop([arbDeepTreeRouteName], { numRuns: NUM_RUNS.standard })(
      "staticPath is non-null exactly when no node in the ancestor chain has params",
      (name: string) => {
        const node = deepTreeNodesByName.get(name)!;

        expect(node).toBeDefined();

        if (hasParamsInChain(node)) {
          expect(node.staticPath).toBeNull();
        } else {
          expect(node.staticPath).not.toBeNull();
          expect(typeof node.staticPath).toBe("string");
        }
      },
    );
  });

  describe("immutability — all tree nodes are frozen by default (medium)", () => {
    const ALL_TREES: readonly RouteTree[] = [
      PARAM_TREE,
      QUERY_TREE,
      MIXED_TREE,
      DEEP_TREE,
      ABSOLUTE_PATH_TREE,
      MIXED_ABSOLUTE_TREE,
    ];

    test.prop(
      [
        fc.constantFrom(
          ...(ALL_TREES as unknown as [RouteTree, ...RouteTree[]]),
        ),
      ],
      { numRuns: NUM_RUNS.fast },
    )(
      "every node and its collections pass Object.isFrozen",
      (tree: RouteTree) => {
        for (const node of [tree, ...collectAllNodes(tree)]) {
          expect(Object.isFrozen(node)).toBe(true);
          expect(Object.isFrozen(node.children)).toBe(true);
          expect(Object.isFrozen(node.paramTypeMap)).toBe(true);
          expect(Object.isFrozen(node.nonAbsoluteChildren)).toBe(true);
        }
      },
    );
  });

  describe("nonAbsoluteChildren — excludes exactly the absolute children (high)", () => {
    const TREES_WITH_VARIETY: readonly RouteTree[] = [
      DEEP_TREE,
      PARAM_TREE,
      ABSOLUTE_PATH_TREE,
      MIXED_ABSOLUTE_TREE,
    ];

    test.prop(
      [
        fc.constantFrom(
          ...(TREES_WITH_VARIETY as unknown as [RouteTree, ...RouteTree[]]),
        ),
      ],
      { numRuns: NUM_RUNS.fast },
    )(
      "nonAbsoluteChildren matches children.values().filter(c => !c.absolute)",
      (tree: RouteTree) => {
        for (const node of [tree, ...collectAllNodes(tree)]) {
          const allChildren = [...node.children.values()];
          const expected = allChildren.filter((c) => !c.absolute);

          expect(node.nonAbsoluteChildren).toHaveLength(expected.length);

          for (const child of expected) {
            expect(node.nonAbsoluteChildren).toContain(child);
          }
        }
      },
    );
  });

  describe("paramTypeMap classification — URL params typed 'url', query params typed 'query' (high)", () => {
    const arbParamName = fc.stringMatching(/^[a-zA-Z_]\w{0,8}$/);

    const arbParamGroups = fc
      .tuple(
        fc.array(arbParamName, { minLength: 0, maxLength: 3 }),
        fc.array(arbParamName, { minLength: 0, maxLength: 3 }),
      )
      .filter(([urls, queries]) => {
        const all = [...urls, ...queries];

        return all.length > 0 && new Set(all).size === all.length;
      });

    test.prop([arbParamGroups], { numRuns: NUM_RUNS.standard })(
      "every URL param is typed 'url' and every query param is typed 'query'",
      ([urlParams, queryParams]: [string[], string[]]) => {
        const urlSegments = urlParams.map((p) => `/:${p}`).join("");
        const queryString =
          queryParams.length > 0 ? `?${queryParams.join("&")}` : "";
        const path = `/base${urlSegments}${queryString}`;

        const tree = createRouteTree("", "", [{ name: "test", path }]);
        const node = tree.children.get("test")!;

        for (const p of urlParams) {
          expect(node.paramTypeMap[p]).toBe("url");
        }

        for (const q of queryParams) {
          expect(node.paramTypeMap[q]).toBe("query");
        }

        expect(Object.keys(node.paramTypeMap)).toHaveLength(
          urlParams.length + queryParams.length,
        );
      },
    );
  });
});

// =============================================================================
// nodeToDefinition Properties
// =============================================================================

describe("nodeToDefinition Properties", () => {
  const allFixtureNodes = [
    PARAM_TREE,
    QUERY_TREE,
    MIXED_TREE,
    DEEP_TREE,
    ABSOLUTE_PATH_TREE,
    MIXED_ABSOLUTE_TREE,
  ].flatMap((tree) => collectAllNodes(tree));

  describe("absolute restoration — absolute flag maps to ~ prefix in output (high)", () => {
    test.prop(
      [
        fc.constantFrom(
          ...(allFixtureNodes as unknown as [RouteTree, ...RouteTree[]]),
        ),
      ],
      { numRuns: NUM_RUNS.standard },
    )(
      "nodeToDefinition output path has ~ prefix iff node.absolute is true",
      (node: RouteTree) => {
        const def = nodeToDefinition(node);

        if (node.absolute) {
          expect(def.path.startsWith("~")).toBe(true);
          expect(def.path.slice(1)).toBe(node.path);
        } else {
          expect(def.path.startsWith("~")).toBe(false);
          expect(def.path).toBe(node.path);
        }
      },
    );
  });
});
