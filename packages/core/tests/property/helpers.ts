import { fc } from "@fast-check/vitest";

import { createRouter } from "@real-router/core";
import {
  getLifecycleApi,
  getPluginApi,
  getRoutesApi,
} from "@real-router/core/api";

import type { Route, Router, State, Params } from "@real-router/core";

// =============================================================================
// Generators (Arbitraries)
// =============================================================================

/** Single route segment name: [a-zA-Z_][a-zA-Z0-9_]* */
export const arbSegmentName = fc.stringMatching(/^[a-zA-Z_]\w{0,15}$/);

/** Route name 1-4 segments, for general router tests */
export const arbRouteName = fc
  .array(arbSegmentName, { minLength: 1, maxLength: 4 })
  .map((a) => a.join("."));

/** Deep route name 1-7 segments, for nameToIDs coverage of all fast-path branches */
export const arbDeepRouteName = fc
  .array(arbSegmentName, { minLength: 1, maxLength: 7 })
  .map((a) => a.join("."));

/** Parameter key */
export const arbParamKey = fc.stringMatching(/^[a-zA-Z_]\w{0,10}$/);

/** Parameter value — string, integer, or boolean */
export const arbParamValue = fc.oneof(
  fc.string({ minLength: 1, maxLength: 20 }),
  fc.integer({ min: 0, max: 9999 }),
  fc.boolean(),
);

/** Arbitrary params dictionary */
export const arbParams = fc.dictionary(arbParamKey, arbParamValue, {
  maxKeys: 5,
});

/** Static route definition (no params) */
export const arbStaticRoute = arbSegmentName.map((name) => ({
  name,
  path: `/${name}`,
}));

// =============================================================================
// Fixed Route Fixture
// =============================================================================

/**
 * Fixed route tree covering: static, param, nested, query, forwardTo.
 * PBT randomizes parameters and call combinations, not tree structure.
 */
export const ROUTES: Route[] = [
  { name: "home", path: "/" },
  {
    name: "users",
    path: "/users",
    children: [
      { name: "list", path: "/" },
      { name: "view", path: "/:id" },
      { name: "edit", path: "/:id/edit" },
    ],
  },
  {
    name: "admin",
    path: "/admin",
    children: [
      { name: "dashboard", path: "/" },
      { name: "settings", path: "/settings" },
    ],
  },
  { name: "search", path: "/search?q&page" },
  { name: "oldUsers", path: "/old-users", forwardTo: "users" },
];

/** All valid route names from the fixture */
export const FIXTURE_ROUTE_NAMES = [
  "home",
  "users",
  "users.list",
  "users.view",
  "users.edit",
  "admin",
  "admin.dashboard",
  "admin.settings",
  "search",
  "oldUsers",
] as const;

/** Non-forwarded leaf route names (navigable targets) */
export const NAVIGABLE_ROUTE_NAMES = [
  "home",
  "users.list",
  "users.view",
  "users.edit",
  "admin.dashboard",
  "admin.settings",
  "search",
] as const;

/** Route-to-path mapping for start() */
export const ROUTE_PATHS: Record<string, string> = {
  home: "/",
  "users.list": "/users",
  "users.view": "/users/abc",
  "users.edit": "/users/abc/edit",
  "admin.dashboard": "/admin",
  "admin.settings": "/admin/settings",
  search: "/search?q=test&page=1",
};

/** Pick a navigable route name */
export const arbNavigableRoute = fc.constantFrom(
  ...(NAVIGABLE_ROUTE_NAMES as unknown as [string, ...string[]]),
);

/** Pick any fixture route name */
export const arbFixtureRoute = fc.constantFrom(
  ...(FIXTURE_ROUTE_NAMES as unknown as [string, ...string[]]),
);

/** Pick a valid start path from the fixture */
export const arbStartPath = fc.constantFrom(
  ...(Object.values(ROUTE_PATHS) as [string, ...string[]]),
);

/** Generate params for users.view / users.edit (requires `:id`) */
export const arbIdParam = fc.record({
  id: fc.stringMatching(/^[a-zA-Z0-9_-]{1,10}$/),
});

/** Generate params for search (requires `q` and `page`) */
export const arbSearchParams = fc.record({
  q: fc.string({ minLength: 1, maxLength: 20 }),
  page: fc.constantFrom("1", "2", "3", "4", "5"),
});

// =============================================================================
// State Generator
// =============================================================================

/** Arbitrary State object (for areStatesEqual and similar) */
export const arbState: fc.Arbitrary<State> = fc
  .record({
    name: arbRouteName,
    params: arbParams as fc.Arbitrary<Params>,
    path: fc.string({ minLength: 1, maxLength: 50 }).map((s) => `/${s}`),
  })
  .map((r) => ({
    name: r.name,
    params: r.params,
    path: r.path,
  }));

// =============================================================================
// Router Factory Helpers
// =============================================================================

/** Create a fresh router with ROUTES fixture */
export function createFixtureRouter(options?: Record<string, unknown>): Router {
  return createRouter(ROUTES, options as never);
}

/** Create and start a router, returning it + state */
export async function createStartedRouter(
  startPath = "/users/abc",
  options?: Record<string, unknown>,
): Promise<Router> {
  const router = createFixtureRouter(options);

  await router.start(startPath);

  return router;
}

/** Get all standalone APIs for a router */
export function getApis(router: Router): {
  routes: ReturnType<typeof getRoutesApi>;
  plugin: ReturnType<typeof getPluginApi>;
  lifecycle: ReturnType<typeof getLifecycleApi>;
} {
  return {
    routes: getRoutesApi(router),
    plugin: getPluginApi(router),
    lifecycle: getLifecycleApi(router),
  };
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Normalize params to strings for comparison after URL roundtrip.
 * URL params are always decoded as strings.
 */
export function normalizeParams(
  params: Record<string, unknown>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(params).map(([k, v]) => [k, String(v)]),
  );
}

/**
 * Get parent segments from a dotted route name.
 * e.g., "users.view" → ["users"]
 */
export function getParentSegments(name: string): string[] {
  const parts = name.split(".");
  const parents: string[] = [];

  for (let i = 1; i < parts.length; i++) {
    parents.push(parts.slice(0, i).join("."));
  }

  return parents;
}

/** Number of runs for different test categories */
export const NUM_RUNS = {
  fast: 100,
  standard: 500,
  thorough: 1000,
} as const;
