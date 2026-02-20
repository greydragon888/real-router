/**
 * matchPath benchmarks
 *
 * Tests router.matchPath() performance across real-world scenarios:
 *
 * Hot paths identified in monorepo:
 * - Browser popstate event handler (very high frequency)
 * - Router initialization with path string
 * - Programmatic URL matching (matchUrl)
 *
 * Categories:
 * 1. Core scenarios - basic path matching patterns
 * 2. Route depth scaling - 1-10 levels deep
 * 3. Parameter count scaling - 0-10 URL params
 * 4. Query parameters - query string parsing overhead
 * 5. Wide tree (static route index) - many sibling routes
 * 6. No match scenario - complete tree traversal worst case
 * 7. Real-world browser patterns - popstate simulation
 * 8. Decoder impact - custom decoders vs none
 * 9. Router options impact - trailingSlash, caseSensitive modes
 * 10. Edge cases - special chars, encoded params
 */

import { bench, boxplot, summary } from "mitata";

import { createRouter } from "@real-router/core";

import type { Params, Route, Router } from "@real-router/core";

// ============================================================================
// Helpers
// ============================================================================

/**
 * Generates a deep nested route tree.
 * E.g., depth=3 creates: level0 -> level1 -> level2
 */
function generateRouteTree(depth: number, parentName = ""): Route[] {
  if (depth === 0) {
    return [];
  }

  const segmentName = `level${parentName ? parentName.split(".").length : 0}`;
  const fullName = parentName ? `${parentName}.${segmentName}` : segmentName;

  return [
    {
      name: segmentName,
      path: `/${segmentName}`,
      children: generateRouteTree(depth - 1, fullName),
    },
  ];
}

/**
 * Generates a deep path for matching.
 * E.g., depth=3 creates: /level0/level1/level2
 */
function generateDeepPath(depth: number): string {
  return Array.from({ length: depth }, (_, i) => `level${i}`).join("/");
}

/**
 * Generates wide sibling routes (static routes for index optimization).
 */
function generateWideRoutes(count: number): Route[] {
  return Array.from({ length: count }, (_, i) => ({
    name: `route${i}`,
    path: `/route${i}`,
  }));
}

/**
 * Creates a router with standard options (mimics real real-router usage).
 */
function createTestRouter(routes: Route[], options = {}): Router {
  return createRouter(routes, options);
}

// ============================================================================
// Test Data
// ============================================================================

// Core routes for basic scenarios
const CORE_ROUTES: Route[] = [
  { name: "home", path: "/" },
  {
    name: "users",
    path: "/users",
    children: [
      { name: "list", path: "/list" },
      { name: "view", path: "/view/:id" },
      {
        name: "profile",
        path: "/profile/:userId",
        children: [{ name: "settings", path: "/settings" }],
      },
    ],
  },
  { name: "search", path: "/search?q&page&sort" },
  { name: "posts", path: "/posts/:postId/comments/:commentId" },
];

// Deep nested routes (10 levels)
const DEEP_ROUTES: Route[] = [...CORE_ROUTES, ...generateRouteTree(10)];

// Routes with varying parameter counts
const PARAM_ROUTES: Route[] = [
  { name: "r0", path: "/r0" },
  { name: "r1", path: "/r1/:p1" },
  { name: "r3", path: "/r3/:p1/:p2/:p3" },
  { name: "r5", path: "/r5/:p1/:p2/:p3/:p4/:p5" },
  { name: "r10", path: "/r10/:p1/:p2/:p3/:p4/:p5/:p6/:p7/:p8/:p9/:p10" },
];

// Wide tree for static route index testing
const WIDE_ROUTES_50: Route[] = generateWideRoutes(50);
const WIDE_ROUTES_200: Route[] = generateWideRoutes(200);

// Pre-computed paths
const DEEP_PATH_5 = `/${generateDeepPath(5)}`;
const DEEP_PATH_10 = `/${generateDeepPath(10)}`;

// ============================================================================
// Category 1: Core Scenarios
// ============================================================================

boxplot(() => {
  summary(() => {
    const router = createTestRouter(CORE_ROUTES);

    bench("matchPath: root path (/)", () => {
      router.matchPath("/");
    });

    bench("matchPath: shallow static (/users)", () => {
      router.matchPath("/users");
    });

    bench("matchPath: nested static (/users/list)", () => {
      router.matchPath("/users/list");
    });

    bench("matchPath: with param (/users/view/123)", () => {
      router.matchPath("/users/view/123");
    });

    bench("matchPath: deep with param (/users/profile/123/settings)", () => {
      router.matchPath("/users/profile/123/settings");
    });

    bench("matchPath: multiple params (/posts/1/comments/2)", () => {
      router.matchPath("/posts/1/comments/2");
    });
  });
});

// ============================================================================
// Category 2: Route Depth Scaling
// ============================================================================

boxplot(() => {
  summary(() => {
    const router = createTestRouter(DEEP_ROUTES);

    bench("matchPath: depth 1", () => {
      router.matchPath("/level0");
    });

    bench("matchPath: depth 2", () => {
      router.matchPath("/level0/level1");
    });

    bench("matchPath: depth 3", () => {
      router.matchPath("/level0/level1/level2");
    });

    bench("matchPath: depth 5", () => {
      router.matchPath(DEEP_PATH_5);
    });

    bench("matchPath: depth 10", () => {
      router.matchPath(DEEP_PATH_10);
    });
  });
});

// ============================================================================
// Category 3: Parameter Count Scaling
// ============================================================================

boxplot(() => {
  summary(() => {
    const router = createTestRouter(PARAM_ROUTES);

    bench("matchPath: 0 params", () => {
      router.matchPath("/r0");
    });

    bench("matchPath: 1 param", () => {
      router.matchPath("/r1/v1");
    });

    bench("matchPath: 3 params", () => {
      router.matchPath("/r3/v1/v2/v3");
    });

    bench("matchPath: 5 params", () => {
      router.matchPath("/r5/v1/v2/v3/v4/v5");
    });

    bench("matchPath: 10 params", () => {
      router.matchPath("/r10/v1/v2/v3/v4/v5/v6/v7/v8/v9/v10");
    });
  });
});

// ============================================================================
// Category 4: Query Parameters
// ============================================================================

boxplot(() => {
  summary(() => {
    const routes: Route[] = [
      { name: "noQuery", path: "/no-query" },
      { name: "query1", path: "/q1?param1" },
      { name: "query3", path: "/q3?param1&param2&param3" },
      { name: "query5", path: "/q5?p1&p2&p3&p4&p5" },
    ];
    const router = createTestRouter(routes);

    bench("matchPath: no query params", () => {
      router.matchPath("/no-query");
    });

    bench("matchPath: 1 query param", () => {
      router.matchPath("/q1?param1=value1");
    });

    bench("matchPath: 3 query params", () => {
      router.matchPath("/q3?param1=v1&param2=v2&param3=v3");
    });

    bench("matchPath: 5 query params", () => {
      router.matchPath("/q5?p1=v1&p2=v2&p3=v3&p4=v4&p5=v5");
    });

    bench("matchPath: extra query params (not in route)", () => {
      router.matchPath("/q1?param1=v1&extra1=e1&extra2=e2");
    });
  });
});

// ============================================================================
// Category 5: Wide Tree (Static Route Index Optimization)
// ============================================================================

boxplot(() => {
  summary(() => {
    const router60 = createTestRouter(WIDE_ROUTES_50);
    const router200 = createTestRouter(WIDE_ROUTES_200);

    // First route (best case)
    bench("matchPath: wide 50 - first", () => {
      router60.matchPath("/route0");
    });

    // Middle route
    bench("matchPath: wide 50 - middle", () => {
      router60.matchPath("/route25");
    });

    // Last route
    bench("matchPath: wide 50 - last", () => {
      router60.matchPath("/route49");
    });

    // 200 routes - first
    bench("matchPath: wide 200 - first", () => {
      router200.matchPath("/route0");
    });

    // 200 routes - middle
    bench("matchPath: wide 200 - middle", () => {
      router200.matchPath("/route100");
    });

    // 200 routes - last
    bench("matchPath: wide 200 - last", () => {
      router200.matchPath("/route199");
    });
  });
});

// ============================================================================
// Category 6: No Match Scenario (Worst Case)
// ============================================================================

boxplot(() => {
  summary(() => {
    const router = createTestRouter(CORE_ROUTES);
    const routerWide = createTestRouter(WIDE_ROUTES_50);
    const routerDeep = createTestRouter(DEEP_ROUTES);

    bench("matchPath: no match - simple tree", () => {
      router.matchPath("/nonexistent");
    });

    bench("matchPath: no match - wide tree (50)", () => {
      routerWide.matchPath("/nonexistent");
    });

    bench("matchPath: no match - deep tree (10)", () => {
      routerDeep.matchPath("/nonexistent/path/that/does/not/exist");
    });

    bench("matchPath: partial match - wrong suffix", () => {
      router.matchPath("/users/list/extra");
    });
  });
});

// ============================================================================
// Category 7: Real-World Browser Patterns
// ============================================================================

boxplot(() => {
  summary(() => {
    const router = createTestRouter(CORE_ROUTES);

    // Popstate event simulation - with source parameter
    bench("matchPath: popstate simulation", () => {
      router.matchPath("/users/view/123");
    });

    // Rapid navigation (batch of 10 matches)
    const paths = [
      "/",
      "/users",
      "/users/list",
      "/users/view/1",
      "/users/view/2",
      "/users/profile/1/settings",
      "/search?q=test",
      "/posts/1/comments/1",
      "/users/view/3",
      "/users/profile/2/settings",
    ];

    bench("matchPath: rapid navigation (10 paths)", () => {
      for (const path of paths) {
        router.matchPath(path);
      }
    });

    // Initial page load (common SPA pattern)
    bench("matchPath: initial page load (deep)", () => {
      router.matchPath("/users/profile/user123/settings");
    });
  });
});

// ============================================================================
// Category 8: Decoder Impact
// ============================================================================

// Decoder function at module scope (per ESLint unicorn rule)
function testDecoder(params: Params): Params {
  const id = params.id as string;

  return { ...params, id: `decoded-${id}` };
}

// Shared route definition for decoder/options tests
const SINGLE_USER_ROUTE: Route[] = [{ name: "users", path: "/users/:id" }];
const TEST_PATH_USER = "/users/123";

boxplot(() => {
  summary(() => {
    const routesWithDecoder: Route[] = [
      { name: "users", path: "/users/:id", decodeParams: testDecoder },
    ];

    const routerNoDecoder = createTestRouter(SINGLE_USER_ROUTE);
    const routerWithDecoder = createTestRouter(routesWithDecoder);

    bench("matchPath: no decoder", () => {
      routerNoDecoder.matchPath(TEST_PATH_USER);
    });

    bench("matchPath: with decoder", () => {
      routerWithDecoder.matchPath(TEST_PATH_USER);
    });
  });
});

// ============================================================================
// Category 9: Router Options Impact
// ============================================================================

boxplot(() => {
  summary(() => {
    // Default options
    const routerDefault = createTestRouter(SINGLE_USER_ROUTE);

    // Trailing slash modes
    const routerTrailingNever = createTestRouter(SINGLE_USER_ROUTE, {
      trailingSlash: "never",
    });
    const routerTrailingAlways = createTestRouter(SINGLE_USER_ROUTE, {
      trailingSlash: "always",
    });

    // Case sensitive
    const routerCaseSensitive = createTestRouter(SINGLE_USER_ROUTE, {
      caseSensitive: true,
    });

    // Query params mode
    const routerQueryStrict = createTestRouter(SINGLE_USER_ROUTE, {
      queryParamsMode: "strict",
    });

    bench("matchPath: default options", () => {
      routerDefault.matchPath(TEST_PATH_USER);
    });

    bench("matchPath: trailingSlash=never", () => {
      routerTrailingNever.matchPath(TEST_PATH_USER);
    });

    bench("matchPath: trailingSlash=always", () => {
      routerTrailingAlways.matchPath("/users/123/");
    });

    bench("matchPath: caseSensitive=true", () => {
      routerCaseSensitive.matchPath(TEST_PATH_USER);
    });

    bench("matchPath: queryParamsMode=strict", () => {
      routerQueryStrict.matchPath(TEST_PATH_USER);
    });
  });
});

// ============================================================================
// Category 10: Edge Cases
// ============================================================================

boxplot(() => {
  summary(() => {
    const routes: Route[] = [
      { name: "home", path: "/" },
      { name: "files", path: "/files/*path" },
      { name: "encoded", path: "/search/:query" },
      { name: "unicode", path: "/users/:name" },
    ];
    const router = createTestRouter(routes);

    bench("matchPath: splat/wildcard param", () => {
      router.matchPath("/files/path/to/deep/file.txt");
    });

    bench("matchPath: URL-encoded param", () => {
      router.matchPath("/search/hello%20world%26more");
    });

    bench("matchPath: unicode param", () => {
      router.matchPath("/users/日本語ユーザー");
    });

    bench("matchPath: empty path segments", () => {
      router.matchPath("/");
    });

    bench("matchPath: trailing slash edge", () => {
      router.matchPath("/files/");
    });
  });
});

// ============================================================================
// Category 11: Comparison - Shallow vs Deep (SPA Optimization)
// ============================================================================

boxplot(() => {
  summary(() => {
    // Typical SPA route structure
    const spaRoutes: Route[] = [
      { name: "home", path: "/" },
      { name: "dashboard", path: "/dashboard" },
      {
        name: "projects",
        path: "/projects",
        children: [
          { name: "list", path: "/list" },
          {
            name: "detail",
            path: "/:projectId",
            children: [
              { name: "overview", path: "/overview" },
              { name: "settings", path: "/settings" },
              {
                name: "tasks",
                path: "/tasks",
                children: [
                  { name: "list", path: "/list" },
                  { name: "detail", path: "/:taskId" },
                ],
              },
            ],
          },
        ],
      },
      { name: "profile", path: "/profile" },
      { name: "settings", path: "/settings" },
    ];

    const router = createTestRouter(spaRoutes);

    // Most common: shallow navigation
    bench("SPA: shallow (dashboard)", () => {
      router.matchPath("/dashboard");
    });

    // Common: medium depth
    bench("SPA: medium (projects list)", () => {
      router.matchPath("/projects/list");
    });

    // Less common: deep navigation
    bench("SPA: deep (project tasks)", () => {
      router.matchPath("/projects/proj-123/tasks/list");
    });

    // Deepest: with multiple params
    bench("SPA: deepest (task detail)", () => {
      router.matchPath("/projects/proj-123/tasks/task-456");
    });
  });
});
