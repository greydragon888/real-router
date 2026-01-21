/**
 * Route Tree Generators for Benchmarks
 *
 * Provides functions to generate various route tree structures
 * for performance testing.
 */

import type { RouteDefinition } from "../../../src/types";

/**
 * Generates a wide tree with N siblings on top-level.
 * Useful for testing O(width) complexity of matchPath.
 *
 * @example
 * generateWideTree(3) → [
 *   { name: 'route-0', path: '/route-0' },
 *   { name: 'route-1', path: '/route-1' },
 *   { name: 'route-2', path: '/route-2' },
 * ]
 */
export function generateWideTree(width: number): RouteDefinition[] {
  return Array.from({ length: width }, (_, i) => ({
    name: `route-${i}`,
    path: `/route-${i}`,
  }));
}

/**
 * Generates a deep tree with N levels.
 * Useful for testing O(depth) complexity.
 *
 * @example
 * generateDeepTree(3) → [
 *   { name: 'l0', path: '/l0', children: [
 *     { name: 'l1', path: '/l1', children: [
 *       { name: 'l2', path: '/l2' }
 *     ]}
 *   ]}
 * ]
 */
export function generateDeepTree(depth: number): RouteDefinition[] {
  if (depth <= 0) {
    return [];
  }

  const buildLevel = (level: number): RouteDefinition => {
    const route: RouteDefinition = {
      name: `l${level}`,
      path: `/l${level}`,
    };

    if (level < depth - 1) {
      route.children = [buildLevel(level + 1)];
    }

    return route;
  };

  return [buildLevel(0)];
}

/**
 * Generates a balanced tree (depth × width).
 * Each level has `width` children.
 *
 * @example
 * generateBalancedTree(2, 2) → [
 *   { name: 'n0', path: '/n0', children: [
 *     { name: 'n0', path: '/n0' },
 *     { name: 'n1', path: '/n1' },
 *   ]},
 *   { name: 'n1', path: '/n1', children: [
 *     { name: 'n0', path: '/n0' },
 *     { name: 'n1', path: '/n1' },
 *   ]},
 * ]
 */
export function generateBalancedTree(
  depth: number,
  width: number,
): RouteDefinition[] {
  if (depth <= 0 || width <= 0) {
    return [];
  }

  const buildLevel = (level: number): RouteDefinition[] => {
    return Array.from({ length: width }, (_, i) => {
      const route: RouteDefinition = {
        name: `n${i}`,
        path: `/n${i}`,
      };

      if (level < depth - 1) {
        route.children = buildLevel(level + 1);
      }

      return route;
    });
  };

  return buildLevel(0);
}

/**
 * Generates a deep tree with URL parameters at each level.
 *
 * @example
 * generateDeepTreeWithParams(3) → [
 *   { name: 'l0', path: '/l0/:p0', children: [
 *     { name: 'l1', path: '/l1/:p1', children: [
 *       { name: 'l2', path: '/l2/:p2' }
 *     ]}
 *   ]}
 * ]
 */
export function generateDeepTreeWithParams(depth: number): RouteDefinition[] {
  if (depth <= 0) {
    return [];
  }

  const buildLevel = (level: number): RouteDefinition => {
    const route: RouteDefinition = {
      name: `l${level}`,
      path: `/l${level}/:p${level}`,
    };

    if (level < depth - 1) {
      route.children = [buildLevel(level + 1)];
    }

    return route;
  };

  return [buildLevel(0)];
}

/**
 * Generates a route with N URL parameters.
 *
 * @example
 * generateRouteWithUrlParams(3) → {
 *   name: 'route',
 *   path: '/segment/:p0/:p1/:p2'
 * }
 */
export function generateRouteWithUrlParams(n: number): RouteDefinition {
  const params = Array.from({ length: n }, (_, i) => `:p${i}`).join("/");

  return {
    name: "route",
    path: `/segment/${params}`,
  };
}

/**
 * Generates a route with N query parameters.
 *
 * @example
 * generateRouteWithQueryParams(3) → {
 *   name: 'route',
 *   path: '/route?q0&q1&q2'
 * }
 */
export function generateRouteWithQueryParams(n: number): RouteDefinition {
  const params = Array.from({ length: n }, (_, i) => `q${i}`).join("&");

  return {
    name: "route",
    path: `/route?${params}`,
  };
}

/**
 * Generates typical SPA routes (~100 routes, 3 levels deep).
 *
 * Structure:
 * - home (/)
 * - users (/users) → list, view → profile, settings, posts
 * - products (/products) → list, view → details, reviews
 * - orders (/orders) → list, view → details, tracking
 * - ... 30 top-level routes
 */
export function generateSpaRoutes(): RouteDefinition[] {
  const resources = [
    "users",
    "products",
    "orders",
    "customers",
    "invoices",
    "reports",
    "settings",
    "notifications",
    "messages",
    "tasks",
    "projects",
    "teams",
    "departments",
    "categories",
    "tags",
    "comments",
    "reviews",
    "ratings",
    "favorites",
    "bookmarks",
    "history",
    "analytics",
    "dashboard",
    "profile",
    "account",
    "billing",
    "subscriptions",
    "plans",
    "features",
    "help",
  ];

  const subPages = ["details", "edit", "settings", "history"];

  const routes: RouteDefinition[] = [{ name: "home", path: "/" }];

  for (const resource of resources) {
    routes.push({
      name: resource,
      path: `/${resource}`,
      children: [
        { name: "list", path: "/" },
        {
          name: "view",
          path: "/:id",
          children: subPages.map((page) => ({
            name: page,
            path: `/${page}`,
          })),
        },
        { name: "create", path: "/new" },
      ],
    });
  }

  return routes;
}

/**
 * Generates Enterprise routes (200+ routes, 5-7 levels deep).
 *
 * Includes:
 * - Deep nested admin sections
 * - Multiple query parameters
 * - Absolute paths for modals
 */
export function generateEnterpriseRoutes(): RouteDefinition[] {
  const routes: RouteDefinition[] = [
    { name: "home", path: "/" },
    {
      name: "admin",
      path: "/admin",
      children: [
        { name: "dashboard", path: "/dashboard" },
        {
          name: "users",
          path: "/users",
          children: [
            { name: "list", path: "/?page&sort&filter" },
            {
              name: "management",
              path: "/management",
              children: [
                {
                  name: "roles",
                  path: "/roles",
                  children: [
                    { name: "list", path: "/" },
                    {
                      name: "permissions",
                      path: "/permissions?filter&sort&page&limit",
                    },
                    { name: "edit", path: "/:roleId/edit" },
                  ],
                },
                {
                  name: "groups",
                  path: "/groups",
                  children: [
                    { name: "list", path: "/" },
                    { name: "view", path: "/:groupId" },
                    {
                      name: "members",
                      path: "/:groupId/members?search&status",
                    },
                  ],
                },
              ],
            },
            { name: "view", path: "/:userId" },
            { name: "edit", path: "/:userId/edit" },
          ],
        },
        {
          name: "settings",
          path: "/settings",
          children: [
            { name: "general", path: "/general" },
            { name: "security", path: "/security" },
            { name: "integrations", path: "/integrations" },
            {
              name: "advanced",
              path: "/advanced",
              children: [
                { name: "performance", path: "/performance" },
                { name: "cache", path: "/cache" },
                { name: "logs", path: "/logs?level&from&to&search" },
              ],
            },
          ],
        },
      ],
    },
  ];

  // Admin section with deep nesting

  // Multiple resource sections
  const sections = [
    "products",
    "orders",
    "customers",
    "invoices",
    "reports",
    "analytics",
    "marketing",
    "inventory",
    "shipping",
    "payments",
    "support",
    "crm",
    "hr",
    "finance",
    "legal",
  ];

  for (const section of sections) {
    routes.push({
      name: section,
      path: `/${section}`,
      children: [
        { name: "list", path: "/?page&sort&filter&status" },
        {
          name: "view",
          path: "/:id",
          children: [
            { name: "details", path: "/details" },
            { name: "history", path: "/history?from&to" },
            { name: "comments", path: "/comments?page" },
            { name: "attachments", path: "/attachments" },
            {
              name: "related",
              path: "/related",
              children: [
                { name: "items", path: "/items" },
                { name: "links", path: "/links" },
              ],
            },
          ],
        },
        { name: "create", path: "/new" },
        { name: "import", path: "/import" },
        { name: "export", path: "/export?format&fields" },
        { name: "bulk", path: "/bulk-actions" },
      ],
    });
  }

  // Absolute paths for modals
  routes.push(
    { name: "modal-confirm", path: "~/modal/confirm" },
    { name: "modal-alert", path: "~/modal/alert" },
    { name: "modal-prompt", path: "~/modal/prompt/:type" },
  );

  return routes;
}

/**
 * Generates routes with absolute paths.
 *
 * @example
 * generateAbsoluteRoutes(3) → [
 *   { name: 'normal', path: '/normal', children: [
 *     { name: 'nested', path: '/nested', children: [
 *       { name: 'absolute', path: '~/absolute' }
 *     ]}
 *   ]},
 *   { name: 'modal-0', path: '~/modal-0' },
 *   { name: 'modal-1', path: '~/modal-1' },
 *   { name: 'modal-2', path: '~/modal-2' },
 * ]
 */
export function generateAbsoluteRoutes(count: number): RouteDefinition[] {
  const routes: RouteDefinition[] = [
    {
      name: "normal",
      path: "/normal",
      children: [
        {
          name: "nested",
          path: "/nested",
          children: [{ name: "absolute", path: "~/absolute" }],
        },
      ],
    },
  ];

  for (let i = 0; i < count; i++) {
    routes.push({
      name: `modal-${i}`,
      path: `~/modal-${i}`,
    });
  }

  return routes;
}

/**
 * Generates path for matching deep routes.
 *
 * @example
 * generateDeepPath(3) → '/l0/l1/l2'
 */
export function generateDeepPath(depth: number): string {
  return Array.from({ length: depth }, (_, i) => `/l${i}`).join("");
}

/**
 * Generates path with parameters for matching.
 *
 * @example
 * generateDeepPathWithParams(3) → '/l0/v0/l1/v1/l2/v2'
 */
export function generateDeepPathWithParams(depth: number): string {
  return Array.from({ length: depth }, (_, i) => `/l${i}/v${i}`).join("");
}

/**
 * Generates params object for path building.
 *
 * @example
 * generateParams(3) → { p0: 'v0', p1: 'v1', p2: 'v2' }
 */
export function generateParams(count: number): Record<string, string> {
  const params: Record<string, string> = {};

  for (let i = 0; i < count; i++) {
    params[`p${i}`] = `v${i}`;
  }

  return params;
}

/**
 * Generates query params object.
 *
 * @example
 * generateQueryParams(3) → { q0: 'v0', q1: 'v1', q2: 'v2' }
 */
export function generateQueryParams(count: number): Record<string, string> {
  const params: Record<string, string> = {};

  for (let i = 0; i < count; i++) {
    params[`q${i}`] = `v${i}`;
  }

  return params;
}

/**
 * Generates a route name for deep nested routes.
 *
 * @example
 * generateDeepRouteName(3) → 'l0.l1.l2'
 */
export function generateDeepRouteName(depth: number): string {
  return Array.from({ length: depth }, (_, i) => `l${i}`).join(".");
}

/**
 * Count total routes in a route tree.
 */
export function countRoutes(routes: RouteDefinition[]): number {
  let count = 0;

  for (const route of routes) {
    count++;
    if (route.children) {
      count += countRoutes(route.children);
    }
  }

  return count;
}

/**
 * Generates a balanced tree with parameters for comprehensive testing.
 *
 * @param depth - Tree depth
 * @param width - Children per node
 * @param withParams - Include URL parameters
 */
export function generateBalancedTreeWithParams(
  depth: number,
  width: number,
  withParams = false,
): RouteDefinition[] {
  if (depth <= 0 || width <= 0) {
    return [];
  }

  const buildLevel = (level: number): RouteDefinition[] => {
    return Array.from({ length: width }, (_, i) => {
      const route: RouteDefinition = {
        name: `n${i}`,
        path: withParams ? `/n${i}/:id${level}` : `/n${i}`,
      };

      if (level < depth - 1) {
        route.children = buildLevel(level + 1);
      }

      return route;
    });
  };

  return buildLevel(0);
}
