/**
 * buildPath benchmarks
 *
 * Tests router.buildPath() performance across:
 * - Core scenarios (simple, with params, query params, UNKNOWN_ROUTE)
 * - Route depth scaling (1-10 levels)
 * - Parameter count scaling (0-10 params)
 * - Default params impact (spread/merge overhead)
 * - Encoder impact (custom vs none)
 * - Encoding strategy (urlParamsEncoding options)
 * - Real-world patterns (navigation, React links batch)
 * - Edge cases (special chars, empty params)
 *
 * This is a hot path method called during navigation and link generation.
 */

import { bench, boxplot, summary } from "mitata";

import { constants, createRouter } from "router6";

import type { Params, Route, Router } from "router6";

// ============================================================================
// Constants
// ============================================================================

const ROUTE_HOME = "home";
const ROUTE_USERS_VIEW = "users.view";
const ROUTE_USERS_LIST = "users.list";
const PARAM_ID_123 = "123";

// ============================================================================
// Helpers
// ============================================================================

function generateDeepRoute(depth: number): { name: string; path: string } {
  const segments = Array.from({ length: depth }, (_, i) => `level${i}`);

  return {
    name: segments.join("."),
    path: `/${segments.join("/")}`,
  };
}

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

function createTestRouter(routes: Route[], options = {}): Router {
  return createRouter(routes, options);
}

// ============================================================================
// Test Data
// ============================================================================

const CORE_ROUTES: Route[] = [
  { name: ROUTE_HOME, path: "/" },
  {
    name: "users",
    path: "/users",
    children: [
      { name: "list", path: "/list" },
      { name: "view", path: "/view/:id" },
    ],
  },
  { name: "search", path: "/search?q&page" },
];

const DEEP_ROUTES: Route[] = [...CORE_ROUTES, ...generateRouteTree(10)];

const PARAMS = {
  none: {},
  one: { id: PARAM_ID_123 },
  three: { id: PARAM_ID_123, page: "1", sort: "name" },
  ten: {
    p1: "v1",
    p2: "v2",
    p3: "v3",
    p4: "v4",
    p5: "v5",
    p6: "v6",
    p7: "v7",
    p8: "v8",
    p9: "v9",
    p10: "v10",
  },
};

// Pre-computed deep route names
const DEEP_ROUTE_5 = generateDeepRoute(5).name;
const DEEP_ROUTE_10 = generateDeepRoute(10).name;

// ============================================================================
// Category 1: Core Scenarios
// ============================================================================

boxplot(() => {
  summary(() => {
    const router = createTestRouter(CORE_ROUTES);

    bench("buildPath: simple no params", () => {
      router.buildPath(ROUTE_HOME);
    });

    bench("buildPath: single param", () => {
      router.buildPath(ROUTE_USERS_VIEW, { id: PARAM_ID_123 });
    });

    bench("buildPath: query params", () => {
      router.buildPath("search", { q: "test", page: "1" });
    });

    bench("buildPath: UNKNOWN_ROUTE", () => {
      router.buildPath(constants.UNKNOWN_ROUTE, { path: "/404" });
    });
  });
});

// ============================================================================
// Category 2: Route Depth Scaling
// ============================================================================

boxplot(() => {
  summary(() => {
    const router = createTestRouter(DEEP_ROUTES);

    bench("buildPath: depth 1", () => {
      router.buildPath(ROUTE_HOME);
    });

    bench("buildPath: depth 2", () => {
      router.buildPath(ROUTE_USERS_LIST);
    });

    bench("buildPath: depth 5", () => {
      router.buildPath(DEEP_ROUTE_5);
    });

    bench("buildPath: depth 10", () => {
      router.buildPath(DEEP_ROUTE_10);
    });
  });
});

// ============================================================================
// Category 3: Parameter Count Scaling
// ============================================================================

boxplot(() => {
  summary(() => {
    const routes: Route[] = [
      { name: "r0", path: "/r0" },
      { name: "r1", path: "/r1/:p1" },
      { name: "r3", path: "/r3/:p1/:p2/:p3" },
      {
        name: "r10",
        path: "/r10/:p1/:p2/:p3/:p4/:p5/:p6/:p7/:p8/:p9/:p10",
      },
    ];
    const router = createTestRouter(routes);

    bench("buildPath: 0 params", () => {
      router.buildPath("r0");
    });

    bench("buildPath: 1 param", () => {
      router.buildPath("r1", { p1: "v1" });
    });

    bench("buildPath: 3 params", () => {
      router.buildPath("r3", { p1: "v1", p2: "v2", p3: "v3" });
    });

    bench("buildPath: 10 params", () => {
      router.buildPath("r10", PARAMS.ten);
    });
  });
});

// ============================================================================
// Category 4: Default Params Impact
// ============================================================================

boxplot(() => {
  summary(() => {
    const routes: Route[] = [
      { name: "noDefaults", path: "/nd/:id" },
      {
        name: "with1Default",
        path: "/d1/:id",
        defaultParams: { sort: "name" },
      },
      {
        name: "with5Defaults",
        path: "/d5/:id",
        defaultParams: {
          sort: "name",
          order: "asc",
          page: "1",
          limit: "10",
          view: "list",
        },
      },
    ];
    const router = createTestRouter(routes);

    bench("buildPath: no defaults", () => {
      router.buildPath("noDefaults", { id: "1" });
    });

    bench("buildPath: 1 default", () => {
      router.buildPath("with1Default", { id: "1" });
    });

    bench("buildPath: 5 defaults", () => {
      router.buildPath("with5Defaults", { id: "1" });
    });
  });
});

// ============================================================================
// Category 5: Encoder Impact
// ============================================================================

// Encoder function for benchmark (must be at module scope per unicorn/consistent-function-scoping)
function testEncoder(p: Params): Params {
  // In benchmarks, we know id is always a string - use type assertion for perf test
  const id = p.id as string;

  return { ...p, id: `encoded-${id}` };
}

boxplot(() => {
  summary(() => {
    const routes: Route[] = [
      { name: "noEncoder", path: "/ne/:id" },
      { name: "withEncoder", path: "/we/:id", encodeParams: testEncoder },
    ];
    const router = createTestRouter(routes);

    bench("buildPath: no encoder", () => {
      router.buildPath("noEncoder", { id: PARAM_ID_123 });
    });

    bench("buildPath: with encoder", () => {
      router.buildPath("withEncoder", { id: PARAM_ID_123 });
    });
  });
});

// ============================================================================
// Category 6: Encoding Strategy
// ============================================================================

boxplot(() => {
  summary(() => {
    const routes: Route[] = [{ name: "route", path: "/route/:value" }];
    // Params with special chars for encoding benchmarks
    const paramsSpecial = { value: "hello world & more" };
    // Simple params for "none" encoding (no special chars)
    const paramsSimple = { value: "hello-world" };

    const routerDefault = createTestRouter(routes, {
      urlParamsEncoding: "default",
    });
    const routerUri = createTestRouter(routes, {
      urlParamsEncoding: "uriComponent",
    });
    const routerNone = createTestRouter(routes, { urlParamsEncoding: "none" });

    bench("buildPath: encoding default", () => {
      routerDefault.buildPath("route", paramsSpecial);
    });

    bench("buildPath: encoding uriComponent", () => {
      routerUri.buildPath("route", paramsSpecial);
    });

    bench("buildPath: encoding none", () => {
      routerNone.buildPath("route", paramsSimple);
    });
  });
});

// ============================================================================
// Category 7: Real-World Patterns
// ============================================================================

boxplot(() => {
  summary(() => {
    const router = createTestRouter(CORE_ROUTES);
    const navLinks = [
      { route: ROUTE_HOME, params: {} },
      { route: ROUTE_USERS_LIST, params: {} },
      { route: ROUTE_USERS_VIEW, params: { id: "1" } },
      { route: ROUTE_USERS_VIEW, params: { id: "2" } },
      { route: "search", params: { q: "test" } },
    ];

    bench("buildPath: navigation (single)", () => {
      router.buildPath(ROUTE_USERS_VIEW, { id: PARAM_ID_123 });
    });

    bench("buildPath: React links batch (5 links)", () => {
      for (const link of navLinks) {
        router.buildPath(link.route, link.params);
      }
    });

    bench("buildPath: React links batch (20 links)", () => {
      for (let i = 0; i < 4; i++) {
        for (const link of navLinks) {
          router.buildPath(link.route, link.params);
        }
      }
    });
  });
});

// ============================================================================
// Category 8: Edge Cases
// ============================================================================

boxplot(() => {
  summary(() => {
    const routes: Route[] = [
      { name: ROUTE_HOME, path: "/" },
      { name: "files", path: "/files/*path" },
      { name: "filter", path: "/filter?tags" },
    ];
    const router = createTestRouter(routes);

    bench("buildPath: empty params object", () => {
      router.buildPath(ROUTE_HOME, {});
    });

    bench("buildPath: special chars", () => {
      router.buildPath("filter", { tags: "a&b=c" });
    });

    bench("buildPath: splat param", () => {
      router.buildPath("files", { path: "a/b/c" });
    });
  });
});

// ============================================================================
// Category 9: R5 Cache Optimization (repeated calls after start)
// ============================================================================

boxplot(() => {
  summary(() => {
    // Router NOT started - buildOptions created on every call
    const routerCold = createTestRouter(CORE_ROUTES);

    // Router started - buildOptions cached after first call
    const routerWarm = createTestRouter(CORE_ROUTES);

    routerWarm.start("/");

    bench("buildPath: cold (not started)", () => {
      routerCold.buildPath(ROUTE_USERS_VIEW, { id: PARAM_ID_123 });
    });

    bench("buildPath: warm (after start)", () => {
      routerWarm.buildPath(ROUTE_USERS_VIEW, { id: PARAM_ID_123 });
    });

    // Batch comparison: 10 calls in a row
    bench("buildPath: cold batch (10 calls)", () => {
      for (let i = 0; i < 10; i++) {
        routerCold.buildPath(ROUTE_USERS_VIEW, { id: String(i) });
      }
    });

    bench("buildPath: warm batch (10 calls)", () => {
      for (let i = 0; i < 10; i++) {
        routerWarm.buildPath(ROUTE_USERS_VIEW, { id: String(i) });
      }
    });
  });
});

// ============================================================================
// Category 10: R6/R7 Fast Path - Deep Static Routes
// ============================================================================
// Tests the fast path optimization for pre-computed staticPath on deeply
// nested routes WITHOUT parameters. This is where the optimization shines.

boxplot(() => {
  summary(() => {
    // Deep STATIC routes (no params) - benefits from fast path
    const DEEP_STATIC_ROUTES: Route[] = [
      {
        name: "app",
        path: "/app",
        children: [
          {
            name: "dashboard",
            path: "/dashboard",
            children: [
              {
                name: "settings",
                path: "/settings",
                children: [
                  {
                    name: "security",
                    path: "/security",
                    children: [{ name: "2fa", path: "/2fa" }],
                  },
                ],
              },
            ],
          },
        ],
      },
    ];

    // Deep DYNAMIC routes (with params) - cannot use fast path
    const DEEP_DYNAMIC_ROUTES: Route[] = [
      {
        name: "org",
        path: "/org/:orgId",
        children: [
          {
            name: "team",
            path: "/team/:teamId",
            children: [
              {
                name: "project",
                path: "/project/:projectId",
                children: [
                  {
                    name: "task",
                    path: "/task/:taskId",
                    children: [{ name: "details", path: "/details" }],
                  },
                ],
              },
            ],
          },
        ],
      },
    ];

    const routerStatic = createTestRouter(DEEP_STATIC_ROUTES);

    routerStatic.start("/app");

    const routerDynamic = createTestRouter(DEEP_DYNAMIC_ROUTES);

    routerDynamic.start("/org/1");

    // Single call comparison
    bench("deep static (5 levels, no params) - FAST PATH", () => {
      routerStatic.buildPath("app.dashboard.settings.security.2fa");
    });

    bench("deep dynamic (5 levels, 4 params) - regular path", () => {
      routerDynamic.buildPath("org.team.project.task.details", {
        orgId: "1",
        teamId: "2",
        projectId: "3",
        taskId: "4",
      });
    });

    // Batch comparison (simulates React rendering 20 links)
    bench("deep static batch (20 calls) - FAST PATH", () => {
      for (let i = 0; i < 20; i++) {
        routerStatic.buildPath("app.dashboard.settings.security.2fa");
      }
    });

    bench("deep dynamic batch (20 calls) - regular path", () => {
      for (let i = 0; i < 20; i++) {
        routerDynamic.buildPath("org.team.project.task.details", {
          orgId: "1",
          teamId: "2",
          projectId: "3",
          taskId: "4",
        });
      }
    });
  });
});

// ============================================================================
// Category 11: Fast Path vs Regular Path (same route structure)
// ============================================================================
// Direct comparison: same 5-level depth, static route with/without options

boxplot(() => {
  summary(() => {
    const STATIC_5_LEVEL: Route[] = [
      {
        name: "a",
        path: "/a",
        children: [
          {
            name: "b",
            path: "/b",
            children: [
              {
                name: "c",
                path: "/c",
                children: [
                  {
                    name: "d",
                    path: "/d",
                    children: [{ name: "e", path: "/e" }],
                  },
                ],
              },
            ],
          },
        ],
      },
    ];

    // Fast path router: default options
    const router = createTestRouter(STATIC_5_LEVEL);

    router.start("/a");

    // Regular path router: trailingSlash=always forces full build
    const routerWithOptions = createTestRouter(STATIC_5_LEVEL, {
      trailingSlash: "always",
    });

    routerWithOptions.start("/a");

    bench("static 5-level: fast path (default options)", () => {
      router.buildPath("a.b.c.d.e");
    });

    bench("static 5-level: regular path (trailingSlash=always)", () => {
      routerWithOptions.buildPath("a.b.c.d.e");
    });

    // Compare: shallow vs deep
    const STATIC_1_LEVEL: Route[] = [{ name: ROUTE_HOME, path: "/home" }];

    const routerShallow = createTestRouter(STATIC_1_LEVEL);

    routerShallow.start("/home");

    const routerShallowWithOptions = createTestRouter(STATIC_1_LEVEL, {
      trailingSlash: "always",
    });

    routerShallowWithOptions.start("/home");

    bench("static 1-level: fast path", () => {
      routerShallow.buildPath(ROUTE_HOME);
    });

    bench("static 1-level: regular path (trailingSlash=always)", () => {
      routerShallowWithOptions.buildPath(ROUTE_HOME);
    });
  });
});
