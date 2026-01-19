/**
 * isActiveRoute benchmarks
 *
 * Tests router.isActiveRoute() performance across:
 * - Core scenarios (exact match, parent active, unrelated routes, siblings)
 * - Parameter scaling (0, 1, 5, 10 params)
 * - Query params handling (ignoreQueryParams=true/false)
 * - Depth scaling (shallow, medium, deep route hierarchies)
 * - Real-world patterns (nav bar, sidebar, breadcrumb)
 *
 * This is a hot path method called by real-router's useIsActiveRoute hook
 * on every route change for every Link component.
 */

import { bench, boxplot, summary } from "mitata";

import { createRouter } from "router6";

import type { Route, Router } from "router6";

// ============================================================================
// Helpers
// ============================================================================

function generateDeepRoute(depth: number): { name: string; path: string } {
  const segments = Array.from({ length: depth })
    .fill(0)
    .map((_, i) => `segment${i}`);

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

// ============================================================================
// Test Data
// ============================================================================

// Routes for core scenarios
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
  { name: "admin", path: "/admin" },
  { name: "settings", path: "/settings" },
];

// Routes with deep hierarchy
const DEEP_ROUTES: Route[] = [
  ...CORE_ROUTES,
  ...generateRouteTree(10), // segment0.segment1...segment9
];

// Routes with query params
const QUERY_ROUTES: Route[] = [
  { name: "home", path: "/" },
  { name: "search", path: "/search?q&page&sort&filter" },
  {
    name: "products",
    path: "/products/:category",
    children: [{ name: "list", path: "/list?page&sort&minPrice&maxPrice" }],
  },
];

// Route name constants to avoid duplication
const ROUTE_USERS_VIEW = "users.view";
const ROUTE_USERS_EDIT = "users.edit";

// Pre-generated params
const PARAMS = {
  none: {},
  one: { id: "123" },
  five: { id: "123", page: "1", sort: "name", filter: "active", view: "grid" },
  ten: {
    id: "123",
    page: "1",
    sort: "name",
    filter: "active",
    view: "grid",
    limit: "10",
    offset: "0",
    category: "electronics",
    brand: "apple",
    status: "available",
  },
};

// ============================================================================
// Core Scenarios
// ============================================================================

boxplot(() => {
  summary(() => {
    const router = createTestRouter(CORE_ROUTES);

    // Navigate to users.view
    router.navigate(ROUTE_USERS_VIEW, { id: "123" });

    bench("isActiveRoute: exact match (same route)", () => {
      router.isActiveRoute(ROUTE_USERS_VIEW, { id: "123" });
    });

    bench("isActiveRoute: parent active (hierarchical)", () => {
      router.isActiveRoute("users");
    });

    bench("isActiveRoute: unrelated route", () => {
      router.isActiveRoute("admin");
    });

    bench("isActiveRoute: sibling route", () => {
      router.isActiveRoute(ROUTE_USERS_EDIT, { id: "123" });
    });

    bench("isActiveRoute: strict equality (true)", () => {
      router.isActiveRoute(ROUTE_USERS_VIEW, { id: "123" }, true);
    });
  });
});

// ============================================================================
// Parameter Scaling
// ============================================================================

boxplot(() => {
  summary(() => {
    const router = createTestRouter(CORE_ROUTES);

    router.navigate("home");

    bench("isActiveRoute: no params", () => {
      router.isActiveRoute("home", PARAMS.none);
    });

    bench("isActiveRoute: 1 param", () => {
      router.isActiveRoute("home", PARAMS.one);
    });

    bench("isActiveRoute: 5 params", () => {
      router.isActiveRoute("home", PARAMS.five);
    });

    bench("isActiveRoute: 10 params", () => {
      router.isActiveRoute("home", PARAMS.ten);
    });
  });
});

// ============================================================================
// Query Params Handling
// ============================================================================

boxplot(() => {
  summary(() => {
    const router = createTestRouter(QUERY_ROUTES);

    router.navigate("products.list", {
      category: "electronics",
      page: "1",
      sort: "price",
      minPrice: "100",
      maxPrice: "1000",
    });

    bench("isActiveRoute: ignoreQueryParams=true (default)", () => {
      router.isActiveRoute("products.list", { category: "electronics" });
    });

    bench("isActiveRoute: ignoreQueryParams=false - partial match", () => {
      router.isActiveRoute(
        "products.list",
        { category: "electronics" },
        false,
        false,
      );
    });

    bench("isActiveRoute: ignoreQueryParams=false - full match", () => {
      router.isActiveRoute(
        "products.list",
        {
          category: "electronics",
          page: "1",
          sort: "price",
          minPrice: "100",
          maxPrice: "1000",
        },
        false,
        false,
      );
    });
  });
});

// ============================================================================
// Depth Scaling
// ============================================================================

boxplot(() => {
  summary(() => {
    const router = createTestRouter(DEEP_ROUTES);

    // Navigate to deep route (10 levels)
    router.navigate(generateDeepRoute(10).name);

    bench("isActiveRoute: shallow (1 level)", () => {
      router.isActiveRoute("segment0");
    });

    bench("isActiveRoute: medium (5 levels)", () => {
      router.isActiveRoute(generateDeepRoute(5).name);
    });

    bench("isActiveRoute: deep (10 levels)", () => {
      router.isActiveRoute(generateDeepRoute(10).name);
    });
  });
});

// ============================================================================
// Real-world Patterns
// ============================================================================

// Navigation bar pattern - checking multiple menu items
boxplot(() => {
  summary(() => {
    const router = createTestRouter(CORE_ROUTES);

    router.navigate(ROUTE_USERS_VIEW, { id: "123" });

    bench("isActiveRoute: nav bar (5 items)", () => {
      router.isActiveRoute("home");
      router.isActiveRoute("users");
      router.isActiveRoute("admin");
      router.isActiveRoute("settings");
      router.isActiveRoute(ROUTE_USERS_VIEW, { id: "123" });
    });

    bench("isActiveRoute: nav bar (10 items)", () => {
      // Simulate typical nav with 10 items
      for (let i = 0; i < 10; i++) {
        router.isActiveRoute("home");
      }
    });
  });
});

// Sidebar links pattern - many unrelated routes
boxplot(() => {
  summary(() => {
    const router = createTestRouter(DEEP_ROUTES);

    router.navigate("users.list");

    bench("isActiveRoute: sidebar (20 unrelated links)", () => {
      for (let i = 0; i < 20; i++) {
        router.isActiveRoute(`segment${i % 10}`);
      }
    });

    bench("isActiveRoute: sidebar (50 unrelated links)", () => {
      for (let i = 0; i < 50; i++) {
        router.isActiveRoute(`segment${i % 10}`);
      }
    });
  });
});

// Breadcrumb pattern - checking all ancestors
boxplot(() => {
  summary(() => {
    const router = createTestRouter(DEEP_ROUTES);

    // Navigate to deep route
    router.navigate(generateDeepRoute(10).name);

    bench("isActiveRoute: breadcrumb (check all 10 ancestors)", () => {
      for (let i = 1; i <= 10; i++) {
        router.isActiveRoute(generateDeepRoute(i).name);
      }
    });
  });
});

// Tab navigation pattern - strict equality checks
boxplot(() => {
  summary(() => {
    const router = createTestRouter(CORE_ROUTES);

    router.navigate(ROUTE_USERS_VIEW, { id: "123" });

    bench("isActiveRoute: tabs - strict equality (5 tabs)", () => {
      router.isActiveRoute("users.list", {}, true);
      router.isActiveRoute(ROUTE_USERS_VIEW, { id: "123" }, true);
      router.isActiveRoute(ROUTE_USERS_EDIT, { id: "123" }, true);
      router.isActiveRoute("home", {}, true);
      router.isActiveRoute("admin", {}, true);
    });
  });
});
