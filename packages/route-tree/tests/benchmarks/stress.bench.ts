/**
 * Route Tree Stress Tests
 *
 * Tests route-tree-specific performance under extreme conditions:
 * 1. Large tree construction
 * 2. Deep nesting construction
 * 3. Batch vs incremental route addition
 * 4. registerTree with realistic trees
 *
 * IMPORTANT: Tree construction operations are measured INSIDE bench blocks
 * since they are one-time operations.
 */

import { barplot, bench, lineplot, summary } from "mitata";

import { createRouteTree, createRouteTreeBuilder } from "../../src/builder";
import { createMatcher as createMatcherFactory } from "../../src/createMatcher";

import type { RouteDefinition } from "../../src/types";

/** Mitata state interface for generator benchmarks */
interface BenchState {
  get: (name: string) => unknown;
}

// =============================================================================
// Helper generators
// =============================================================================

function generateFlatRoutes(count: number): RouteDefinition[] {
  return Array.from({ length: count }, (_, i) => ({
    name: `route${i}`,
    path: `/route${i}`,
  }));
}

function generateDeepRoutes(depth: number): RouteDefinition[] {
  let current: RouteDefinition = {
    name: `l${depth - 1}`,
    path: `/l${depth - 1}`,
  };

  for (let i = depth - 2; i >= 0; i--) {
    current = { name: `l${i}`, path: `/l${i}`, children: [current] };
  }

  return [current];
}

function generateSPARoutes(): RouteDefinition[] {
  return [
    { name: "home", path: "/" },
    {
      name: "users",
      path: "/users",
      children: [
        { name: "list", path: "/" },
        {
          name: "view",
          path: "/:id",
          children: [
            { name: "profile", path: "/profile" },
            { name: "settings", path: "/settings" },
          ],
        },
        { name: "create", path: "/new" },
      ],
    },
    {
      name: "products",
      path: "/products",
      children: [
        { name: "list", path: "/?page&sort" },
        {
          name: "view",
          path: "/:id",
          children: [
            { name: "details", path: "/details" },
            { name: "reviews", path: "/reviews" },
          ],
        },
      ],
    },
    { name: "about", path: "/about" },
    { name: "contact", path: "/contact" },
  ];
}

function generateEnterpriseRoutes(): RouteDefinition[] {
  return [
    { name: "home", path: "/" },
    ...Array.from({ length: 15 }, (_, i) => ({
      name: `module${i}`,
      path: `/module${i}`,
      children: [
        { name: "list", path: "/?page&sort&filter" },
        {
          name: "view",
          path: "/:id",
          children: [
            { name: "details", path: "/details" },
            { name: "edit", path: "/edit" },
            { name: "history", path: "/history" },
            { name: "permissions", path: "/permissions" },
          ],
        },
        { name: "create", path: "/new" },
        { name: "import", path: "/import" },
        { name: "export", path: "/export" },
      ],
    })),
  ];
}

// =============================================================================
// JIT Warmup
// =============================================================================
{
  for (let i = 0; i < 20; i++) {
    createRouteTree("", "", generateFlatRoutes(10));

    const builder = createRouteTreeBuilder("", "");

    builder.addMany(generateFlatRoutes(10)).build();
  }
}

// =============================================================================
// 1. Large tree construction
//    lineplot createRouteTree with [100, 500, 1000] routes
// =============================================================================

lineplot(() => {
  summary(() => {
    bench(
      "stress: createRouteTree $count routes",
      function* (state: BenchState) {
        const count = state.get("count") as number;
        const routes = generateFlatRoutes(count);

        yield () => {
          createRouteTree("", "", routes);
        };
      },
    ).args("count", [100, 500, 1000]);
  });
});

// =============================================================================
// 2. Deep nesting construction
//    lineplot [10, 20, 50] levels
// =============================================================================

lineplot(() => {
  summary(() => {
    bench("stress: createRouteTree $depth deep", function* (state: BenchState) {
      const depth = state.get("depth") as number;
      const routes = generateDeepRoutes(depth);

      yield () => {
        createRouteTree("", "", routes);
      };
    }).args("depth", [10, 20, 50]);
  });
});

// =============================================================================
// 3. Batch vs incremental
//    barplot addMany vs add loop for [50, 200, 500] routes
// =============================================================================

barplot(() => {
  summary(() => {
    const sizes = [50, 200, 500];

    for (const size of sizes) {
      const routes = generateFlatRoutes(size);

      bench(`stress: addMany ${size} routes`, () => {
        createRouteTreeBuilder("", "").addMany(routes).build();
      });

      bench(`stress: add loop ${size} routes`, () => {
        const builder = createRouteTreeBuilder("", "");

        for (const route of routes) {
          builder.add(route);
        }

        builder.build();
      });
    }
  });
});

// =============================================================================
// 4. registerTree with realistic trees
//    barplot SPA vs Enterprise generators
// =============================================================================

barplot(() => {
  summary(() => {
    const spaTree = createRouteTree("", "", generateSPARoutes());
    const enterpriseTree = createRouteTree("", "", generateEnterpriseRoutes());

    bench("stress: registerTree SPA (~15 routes)", () => {
      const m = createMatcherFactory();

      m.registerTree(spaTree);
    });

    bench("stress: registerTree Enterprise (~120 routes)", () => {
      const m = createMatcherFactory();

      m.registerTree(enterpriseTree);
    });
  });
});
