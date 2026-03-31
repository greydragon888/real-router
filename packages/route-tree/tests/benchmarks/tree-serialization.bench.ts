/**
 * routeTreeToDefinitions / nodeToDefinition benchmarks (SSR critical path)
 *
 * Tests tree → RouteDefinition[] conversion performance:
 * - Small/medium/large trees
 * - Absolute paths (~ prefix reconstruction)
 * - Deep nesting
 *
 * Used by cloneRouter() — called per HTTP request in SSR.
 *
 * IMPORTANT: routeTreeToDefinitions() is a non-mutating operation.
 * Tree must be created OUTSIDE bench blocks.
 */

import { barplot, bench, do_not_optimize, lineplot, summary } from "mitata";

import {
  generateDeepTree,
  generateEnterpriseRoutes,
  generateSpaRoutes,
} from "./helpers/generators";
import { createRouteTree } from "../../src/builder";
import {
  routeTreeToDefinitions,
  nodeToDefinition,
} from "../../src/operations/routeTreeToDefinitions";

import type { RouteDefinition } from "../../src/types";

// =============================================================================
// JIT Warmup
// =============================================================================
{
  const warmupTree = createRouteTree("", "", generateSpaRoutes());

  for (let i = 0; i < 100; i++) {
    routeTreeToDefinitions(warmupTree);

    for (const child of warmupTree.children.values()) {
      nodeToDefinition(child);
    }
  }
}

// =============================================================================
// Test fixtures
// =============================================================================

const smallRoutes: RouteDefinition[] = [
  { name: "home", path: "/" },
  { name: "about", path: "/about" },
  {
    name: "users",
    path: "/users",
    children: [
      { name: "list", path: "/" },
      { name: "view", path: "/:id" },
    ],
  },
];

const spaRoutes = generateSpaRoutes();
const enterpriseRoutes = generateEnterpriseRoutes();

const smallTree = createRouteTree("", "", smallRoutes);
const spaTree = createRouteTree("", "", spaRoutes);
const enterpriseTree = createRouteTree("", "", enterpriseRoutes);

// Tree with absolute paths (tests ~ prefix reconstruction)
const absoluteRoutes: RouteDefinition[] = [
  { name: "home", path: "/" },
  {
    name: "app",
    path: "/app",
    children: [
      { name: "dashboard", path: "/dashboard" },
      { name: "modal-confirm", path: "~/modal/confirm" },
      { name: "modal-alert", path: "~/modal/alert" },
    ],
  },
  { name: "overlay", path: "~/overlay/:type" },
];
const absoluteTree = createRouteTree("", "", absoluteRoutes);

// Deep tree (tests recursive depth — used in section 3)

// =============================================================================
// 1. routeTreeToDefinitions: tree size scaling
//    SSR calls this per request via cloneRouter()
// =============================================================================

barplot(() => {
  summary(() => {
    bench("toDefinitions: small (5 routes)", () => {
      do_not_optimize(routeTreeToDefinitions(smallTree));
    });

    bench("toDefinitions: SPA (~100 routes)", () => {
      do_not_optimize(routeTreeToDefinitions(spaTree));
    });

    bench("toDefinitions: Enterprise (200+ routes)", () => {
      do_not_optimize(routeTreeToDefinitions(enterpriseTree));
    });
  });
});

// =============================================================================
// 2. routeTreeToDefinitions: absolute path reconstruction
//    Tests ~ prefix is correctly reconstructed
// =============================================================================

barplot(() => {
  summary(() => {
    bench("toDefinitions: with absolute paths", () => {
      do_not_optimize(routeTreeToDefinitions(absoluteTree));
    });

    bench("toDefinitions: small (no absolute)", () => {
      do_not_optimize(routeTreeToDefinitions(smallTree));
    });
  });
});

// =============================================================================
// 3. routeTreeToDefinitions: deep nesting
//    Tests recursive depth impact
// =============================================================================

lineplot(() => {
  summary(() => {
    const depths = [5, 10, 20];

    for (const depth of depths) {
      const tree = createRouteTree("", "", generateDeepTree(depth));

      bench(`toDefinitions: depth ${depth}`, () => {
        do_not_optimize(routeTreeToDefinitions(tree));
      });
    }
  });
});

// =============================================================================
// 4. nodeToDefinition: single node conversion
//    Used by getRoutesApi().get() to export a single route
// =============================================================================

barplot(() => {
  summary(() => {
    // Leaf node (no children)
    const leafNode = spaTree.children.get("home")!;

    // Node with children
    const parentNode = spaTree.children.get("users")!;

    bench("nodeToDefinition: leaf node", () => {
      do_not_optimize(nodeToDefinition(leafNode));
    });

    bench("nodeToDefinition: node with children", () => {
      do_not_optimize(nodeToDefinition(parentNode));
    });
  });
});
