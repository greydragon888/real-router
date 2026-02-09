/**
 * Integration Pipeline Benchmarks (route-tree layer)
 *
 * Pure path-matcher pipeline benchmarks (match + buildPath, optional params,
 * match vs pipeline isolation) live in packages/path-matcher/tests/benchmarks/.
 *
 * This file tests route-tree-specific concerns:
 * - 4. Lookup operations: hasRoute, getSegmentsByName, getMetaByName
 * - 5. registerTree startup cost
 * - 6. setRootPath scenarios
 * - 7. Pipeline depth scaling
 *
 * IMPORTANT: All operations are non-mutating after setup.
 * Matcher must be created OUTSIDE bench blocks.
 */

import { barplot, bench, do_not_optimize, lineplot, summary } from "mitata";

import { createRouteTree } from "../../src/builder";
import { createMatcher as createMatcherFactory } from "../../src/createMatcher";

import type { Matcher } from "../../src/createMatcher";
import type { RouteDefinition } from "../../src/types";

function createMatcher(
  routes: RouteDefinition[],
  options?: Parameters<typeof createMatcherFactory>[0],
): Matcher {
  const tree = createRouteTree("", "", routes);
  const matcher = createMatcherFactory(options);

  matcher.registerTree(tree);

  return matcher;
}

// =============================================================================
// JIT Warmup: Pre-warm all code paths
// =============================================================================
{
  const warmupRoutes: RouteDefinition[] = [
    { name: "home", path: "/" },
    { name: "about", path: "/about" },
    { name: "user", path: "/users/:id" },
    {
      name: "users",
      path: "/users",
      children: [{ name: "profile", path: "/:id/profile" }],
    },
  ];
  const warmupMatcher = createMatcher(warmupRoutes);

  for (let i = 0; i < 100; i++) {
    warmupMatcher.match("/about");
    warmupMatcher.match("/users/123");
    warmupMatcher.match("/users/123/profile");

    warmupMatcher.buildPath("about");
    warmupMatcher.buildPath("user", { id: "123" });
    warmupMatcher.buildPath("users.profile", { id: "123" });

    warmupMatcher.hasRoute("users.profile");
    warmupMatcher.getSegmentsByName("users.profile");
    warmupMatcher.getMetaByName("users.profile");
  }
}

// =============================================================================
// Route fixtures
// =============================================================================

const standardRoutes: RouteDefinition[] = [
  { name: "home", path: "/" },
  { name: "about", path: "/about" },
  { name: "user", path: "/users/:id" },
  {
    name: "users",
    path: "/users",
    children: [{ name: "profile", path: "/:id/profile" }],
  },
];

// =============================================================================
// 4. Lookup operations
//    Used by RoutesNamespace: getRoute, buildState, getUrlParams.
//    Should be O(1) Map lookups -- verify no hidden overhead.
// =============================================================================

barplot(() => {
  summary(() => {
    const matcher = createMatcher(standardRoutes);

    bench("lookup: hasRoute (simple)", () => {
      do_not_optimize(matcher.hasRoute("about"));
    });

    bench("lookup: hasRoute (nested)", () => {
      do_not_optimize(matcher.hasRoute("users.profile"));
    });

    bench("lookup: getSegmentsByName (simple)", () => {
      do_not_optimize(matcher.getSegmentsByName("about"));
    });

    bench("lookup: getSegmentsByName (nested)", () => {
      do_not_optimize(matcher.getSegmentsByName("users.profile"));
    });

    bench("lookup: getMetaByName (simple)", () => {
      do_not_optimize(matcher.getMetaByName("about"));
    });

    bench("lookup: getMetaByName (nested)", () => {
      do_not_optimize(matcher.getMetaByName("users.profile"));
    });
  });
});

// =============================================================================
// 5. registerTree: startup cost
//    Called once at router creation and on addRoute/removeRoute.
//    Important for DX (startup time) and SSR (per-request clone).
// =============================================================================

barplot(() => {
  summary(() => {
    // Small: 4 routes
    const smallTree = createRouteTree("", "", standardRoutes);

    bench("register: small (4 routes)", () => {
      const m = createMatcherFactory();

      m.registerTree(smallTree);
    });

    // Medium: ~20 routes (SPA)
    const mediumRoutes: RouteDefinition[] = [
      { name: "home", path: "/" },
      ...["users", "products", "orders", "settings"].map((r) => ({
        name: r,
        path: `/${r}`,
        children: [
          { name: "list", path: "/" },
          {
            name: "view",
            path: "/:id",
            children: [
              { name: "details", path: "/details" },
              { name: "edit", path: "/edit" },
            ],
          },
          { name: "create", path: "/new" },
        ],
      })),
    ];
    const mediumTree = createRouteTree("", "", mediumRoutes);

    bench("register: medium (~20 routes)", () => {
      const m = createMatcherFactory();

      m.registerTree(mediumTree);
    });

    // Large: 100+ routes (enterprise)
    const largeRoutes: RouteDefinition[] = [
      { name: "home", path: "/" },
      ...Array.from({ length: 20 }, (_, i) => ({
        name: `section${i}`,
        path: `/section${i}`,
        children: [
          { name: "list", path: "/?page&sort" },
          {
            name: "view",
            path: "/:id",
            children: [
              { name: "details", path: "/details" },
              { name: "edit", path: "/edit" },
              { name: "history", path: "/history" },
            ],
          },
          { name: "create", path: "/new" },
        ],
      })),
    ];
    const largeTree = createRouteTree("", "", largeRoutes);

    bench("register: large (~100 routes)", () => {
      const m = createMatcherFactory();

      m.registerTree(largeTree);
    });
  });
});

// =============================================================================
// 6. setRootPath scenarios
//    Used when router has a base path (e.g., "/app", "/v2").
//    Tests that rootPath stripping doesn't add significant overhead.
// =============================================================================

barplot(() => {
  summary(() => {
    const matcherNoRoot = createMatcher(standardRoutes);

    const matcherWithRoot = createMatcher(standardRoutes);

    matcherWithRoot.setRootPath("/app");

    bench("rootPath: match without rootPath", () => {
      matcherNoRoot.match("/users/123/profile");
    });

    bench("rootPath: match with rootPath /app", () => {
      matcherWithRoot.match("/app/users/123/profile");
    });

    bench("rootPath: pipeline without rootPath", () => {
      const result = matcherNoRoot.match("/users/123/profile");

      if (result) {
        matcherNoRoot.buildPath(
          "users.profile",
          result.params as Record<string, string>,
        );
      }
    });

    bench("rootPath: pipeline with rootPath /app", () => {
      const result = matcherWithRoot.match("/app/users/123/profile");

      if (result) {
        matcherWithRoot.buildPath(
          "users.profile",
          result.params as Record<string, string>,
        );
      }
    });
  });
});

// =============================================================================
// 7. Pipeline scaling: depth impact on match + buildPath
//    Shows how nested routes affect the combined pipeline cost.
// =============================================================================

lineplot(() => {
  summary(() => {
    // Depth 1: /l0/:p0
    const d1Routes: RouteDefinition[] = [{ name: "l0", path: "/l0/:p0" }];
    const d1 = createMatcher(d1Routes);

    // Depth 3: /l0/:p0/l1/:p1/l2/:p2
    const d3Routes: RouteDefinition[] = [
      {
        name: "l0",
        path: "/l0/:p0",
        children: [
          {
            name: "l1",
            path: "/l1/:p1",
            children: [{ name: "l2", path: "/l2/:p2" }],
          },
        ],
      },
    ];
    const d3 = createMatcher(d3Routes);

    // Depth 5: /l0/:p0/.../l4/:p4
    const d5Routes: RouteDefinition[] = [
      {
        name: "l0",
        path: "/l0/:p0",
        children: [
          {
            name: "l1",
            path: "/l1/:p1",
            children: [
              {
                name: "l2",
                path: "/l2/:p2",
                children: [
                  {
                    name: "l3",
                    path: "/l3/:p3",
                    children: [{ name: "l4", path: "/l4/:p4" }],
                  },
                ],
              },
            ],
          },
        ],
      },
    ];
    const d5 = createMatcher(d5Routes);

    bench("pipeline-depth: 1 level", () => {
      const r = d1.match("/l0/v0");

      if (r) {
        d1.buildPath("l0", r.params as Record<string, string>);
      }
    });

    bench("pipeline-depth: 3 levels", () => {
      const r = d3.match("/l0/v0/l1/v1/l2/v2");

      if (r) {
        d3.buildPath("l0.l1.l2", r.params as Record<string, string>);
      }
    });

    bench("pipeline-depth: 5 levels", () => {
      const r = d5.match("/l0/v0/l1/v1/l2/v2/l3/v3/l4/v4");

      if (r) {
        d5.buildPath("l0.l1.l2.l3.l4", r.params as Record<string, string>);
      }
    });
  });
});
