/**
 * shouldUpdateNode benchmarks
 *
 * Tests router.shouldUpdateNode() performance across:
 * - Factory creation (predicate generation)
 * - Core scenarios (reload, initial, intersection, activate, deactivate)
 * - Depth scaling (1-10 levels)
 * - Real-world patterns (useRouteNode, sidebar, fast navigation)
 *
 * This method is used by real-router's useRouteNode hook to determine
 * if a component should re-render on route changes.
 */

import { bench, boxplot, summary } from "mitata";

import { createRouter } from "router6";

import type { NavigationOptions, Route, Router, State } from "router6";

// ============================================================================
// Helpers
// ============================================================================

function generateDeepRoute(depth: number): { name: string; path: string } {
  const segments = Array.from({ length: depth }, (_, i) => `segment${i}`);

  return {
    name: segments.join("."),
    path: `/${segments.join("/")}`,
  };
}

function generateRouteTree(depth: number, parentName = ""): Route[] {
  if (depth === 0) {
    return [];
  }

  const segmentName = `segment${parentName ? parentName.split(".").length : 0}`;
  const fullName = parentName ? `${parentName}.${segmentName}` : segmentName;

  return [
    {
      name: segmentName,
      path: `/${segmentName}`,
      children: generateRouteTree(depth - 1, fullName),
    },
  ];
}

function createTestRouter(routes: Route[]): Router {
  const router = createRouter(routes, {
    defaultRoute: routes[0]?.name ?? "home",
  });

  router.start();

  return router;
}

function makeState(
  name: string,
  params: Record<string, string> = {},
  options?: NavigationOptions,
): State {
  return {
    name,
    params,
    path: `/${name.replaceAll(".", "/")}`,
    meta: options
      ? { id: 1, params: {}, options, redirected: false }
      : undefined,
  };
}

// ============================================================================
// Test Data
// ============================================================================

const CORE_ROUTES: Route[] = [
  { name: "home", path: "/" },
  {
    name: "users",
    path: "/users",
    children: [
      { name: "list", path: "/list" },
      { name: "view", path: "/view/:id" },
      { name: "edit", path: "/edit/:id" },
    ],
  },
  {
    name: "admin",
    path: "/admin",
    children: [{ name: "dashboard", path: "/dashboard" }],
  },
  { name: "settings", path: "/settings" },
];

const DEEP_ROUTES: Route[] = [...CORE_ROUTES, ...generateRouteTree(10)];

// Route name constants to avoid duplication
const ROUTE_USERS_VIEW = "users.view";

// Pre-created states
const STATES = {
  home: makeState("home"),
  usersList: makeState("users.list"),
  usersView: makeState(ROUTE_USERS_VIEW, { id: "123" }),
  adminDashboard: makeState("admin.dashboard"),
  withReload: makeState(ROUTE_USERS_VIEW, { id: "123" }, { reload: true }),
  deep5: makeState(generateDeepRoute(5).name),
  deep10: makeState(generateDeepRoute(10).name),
};

// ============================================================================
// Factory Creation
// ============================================================================

boxplot(() => {
  summary(() => {
    const router = createTestRouter(CORE_ROUTES);

    bench("factory: create predicate (simple name)", () => {
      router.shouldUpdateNode("users");
    });

    bench("factory: create predicate (deep name)", () => {
      router.shouldUpdateNode("users.view.details.settings");
    });

    // Simulate WeakMap caching pattern from real-router
    const cache = new Map<string, ReturnType<typeof router.shouldUpdateNode>>();

    bench("factory: cached lookup (WeakMap pattern)", () => {
      let fn = cache.get(ROUTE_USERS_VIEW);

      if (!fn) {
        fn = router.shouldUpdateNode(ROUTE_USERS_VIEW);
        cache.set(ROUTE_USERS_VIEW, fn);
      }

      fn;
    });
  });
});

// ============================================================================
// Core Scenarios (Predicate Execution)
// ============================================================================

boxplot(() => {
  summary(() => {
    const router = createTestRouter(CORE_ROUTES);

    // Pre-create predicates (as in real-router)
    const rootPredicate = router.shouldUpdateNode("");
    const usersPredicate = router.shouldUpdateNode("users");
    const usersViewPredicate = router.shouldUpdateNode(ROUTE_USERS_VIEW);
    const adminPredicate = router.shouldUpdateNode("admin");

    bench("predicate: reload=true (fast path)", () => {
      usersViewPredicate(STATES.withReload, STATES.usersList);
    });

    bench("predicate: root node initial navigation", () => {
      rootPredicate(STATES.home, undefined);
    });

    // Tests below use gc('inner') to run GC before each iteration,
    // reducing RME caused by GC pauses during high-allocation scenarios
    bench("predicate: at intersection", () => {
      // users.list → users.view: intersection = "users"
      usersPredicate(STATES.usersView, STATES.usersList);
    }).gc("inner");

    bench("predicate: in toActivate", () => {
      // users.list → users.view: users.view is activated
      usersViewPredicate(STATES.usersView, STATES.usersList);
    }).gc("inner");

    bench("predicate: in toDeactivate", () => {
      // users.view → admin.dashboard: users.view is deactivated
      usersViewPredicate(STATES.adminDashboard, STATES.usersView);
    }).gc("inner");

    bench("predicate: not in path (return false)", () => {
      // users.list → users.view: admin is not in path
      adminPredicate(STATES.usersView, STATES.usersList);
    }).gc("inner");
  });
});

// ============================================================================
// Depth Scaling
// ============================================================================

boxplot(() => {
  summary(() => {
    const router = createTestRouter(DEEP_ROUTES);

    const shallow = router.shouldUpdateNode("segment0");
    const medium = router.shouldUpdateNode(generateDeepRoute(5).name);
    const deep = router.shouldUpdateNode(generateDeepRoute(10).name);

    // High heap allocation (~913 bytes) - use gc('inner') for stable results
    bench("depth: 1 level (shallow)", () => {
      shallow(STATES.deep10, STATES.home);
    }).gc("inner");

    bench("depth: 5 levels (medium)", () => {
      medium(STATES.deep10, STATES.home);
    }).gc("inner");

    bench("depth: 10 levels (deep)", () => {
      deep(STATES.deep10, STATES.home);
    }).gc("inner");
  });
});

// ============================================================================
// Real-world Patterns
// ============================================================================

boxplot(() => {
  summary(() => {
    const router = createTestRouter(CORE_ROUTES);

    // Pattern 1: useRouteNode - one node, multiple navigations
    const usersPredicate = router.shouldUpdateNode("users");

    // High heap allocation patterns - use gc('inner') for stable results
    bench("pattern: useRouteNode (1 node × 10 navigations)", () => {
      for (let i = 0; i < 10; i++) {
        usersPredicate(STATES.usersView, STATES.usersList);
      }
    }).gc("inner");

    // Pattern 2: Sidebar - multiple nodes, one navigation
    const predicates = [
      "home",
      "users",
      "users.list",
      ROUTE_USERS_VIEW,
      "admin",
      "settings",
    ].map((name) => router.shouldUpdateNode(name));

    bench("pattern: sidebar (6 nodes × 1 navigation)", () => {
      for (const pred of predicates) {
        pred(STATES.usersView, STATES.usersList);
      }
    }).gc("inner");

    // Pattern 3: Fast navigation - rapid state changes
    const viewPredicate = router.shouldUpdateNode(ROUTE_USERS_VIEW);

    bench("pattern: fast navigation (1 node × 100 transitions)", () => {
      for (let i = 0; i < 100; i++) {
        viewPredicate(STATES.usersView, STATES.usersList);
      }
    }).gc("inner");
  });
});

// ============================================================================
// Comparison: shouldUpdateNode vs getTransitionPath direct
// ============================================================================

boxplot(() => {
  summary(() => {
    const router = createTestRouter(CORE_ROUTES);
    const predicate = router.shouldUpdateNode("users");

    bench("shouldUpdateNode predicate call", () => {
      predicate(STATES.usersView, STATES.usersList);
    }).gc("inner");

    // For reference: direct getTransitionPath is benchmarked separately
  });
});
