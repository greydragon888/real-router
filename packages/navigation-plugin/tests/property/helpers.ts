// packages/navigation-plugin/tests/property/helpers.ts

/**
 * Shared helpers for navigation-plugin property-based tests.
 *
 * Provides:
 * - Route fixture (same shape as functional test helpers)
 * - fast-check arbitraries for route names, id params, base paths
 * - createPluginRouter factory — creates router + registers navigationPluginFactory
 * - createPluginRouterWithMock factory — returns router + mockNav for stateful tests
 * - NUM_RUNS constants for controlling test iterations
 */

import { fc } from "@fast-check/vitest";
import { createRouter } from "@real-router/core";

import { navigationPluginFactory } from "@real-router/navigation-plugin";

import { MockNavigation } from "../helpers/mockNavigation";
import { createMockNavigationBrowser } from "../helpers/testUtils";

import type { NavigationBrowser } from "../../src/types";
import type { Route, Router } from "@real-router/core";

// =============================================================================
// Constants
// =============================================================================

export const NUM_RUNS = {
  fast: 200,
  standard: 500,
} as const;

// =============================================================================
// Route Fixture
// =============================================================================

/**
 * Fixed route tree for property tests.
 * Covers: static leaf, nested static, parameterized (:id).
 * PBT randomizes params and base paths — not the tree structure.
 */
export const ROUTES: Route[] = [
  {
    name: "users",
    path: "/users",
    children: [
      { name: "view", path: "/view/:id" },
      { name: "list", path: "/list" },
    ],
  },
  { name: "home", path: "/home" },
  { name: "index", path: "/" },
];

/**
 * Leaf routes that require no URL params.
 * Used in invariants that don't involve parameterized paths.
 */
export const LEAF_ROUTE_NAMES = ["home", "users.list", "index"] as const;

/**
 * The single parameterized route in the fixture.
 * Path: /users/view/:id
 */
export const PARAM_ROUTE_NAME = "users.view" as const;

// =============================================================================
// Arbitraries
// =============================================================================

/**
 * Arbitrary: pick one of the leaf route names (no URL params).
 */
export const arbLeafRoute: fc.Arbitrary<string> = fc.constantFrom(
  ...(LEAF_ROUTE_NAMES as unknown as [string, ...string[]]),
);

/**
 * Arbitrary: alphanumeric ID param for `users.view`.
 * URL-safe characters — encode as identity, so the roundtrip is purely
 * about the Navigation API path extraction (safeParseUrl manual parser).
 */
export const arbIdParam: fc.Arbitrary<{ id: string }> = fc.record({
  id: fc.stringMatching(/^[a-zA-Z0-9_-]{1,10}$/),
});

/**
 * Arbitrary: already-normalized base path (leading slash, no trailing slash).
 *
 * These are the values that `normalizeBase()` would produce.
 * Used in P3/P4 (base inclusion and roundtrip) where we want a clean,
 * predictable base without testing normalization itself.
 */
export const arbNormalizedBase: fc.Arbitrary<string> = fc.oneof(
  fc.constant(""),
  fc
    .array(fc.stringMatching(/^[a-z]{1,6}$/), { minLength: 1, maxLength: 3 })
    .map((segs) => `/${segs.join("/")}`),
);

/**
 * Arbitrary: base path segment (no trailing slash) for normalization tests.
 *
 * Used in P5 to compare `base` vs `base + "/"` producing the same output.
 */
export const arbBaseSegment: fc.Arbitrary<string> = fc.constantFrom(
  "/app",
  "/sub",
  "/base",
);

export const arbRawBase: fc.Arbitrary<string> = fc.oneof(
  fc.constant(""),
  fc.stringMatching(/^\/[a-z]{1,8}$/),
  fc.stringMatching(/^[a-z]{1,8}$/),
  fc.stringMatching(/^\/[a-z]{1,8}\/$/),
  fc.stringMatching(/^\/[a-z]{1,4}\/[a-z]{1,4}$/),
);

// --- P2c: URL-unsafe character params ---

export const arbUnsafeIdParam: fc.Arbitrary<{ id: string }> = fc.record({
  id: fc
    .string({ minLength: 1, maxLength: 20 })
    .filter((s) => s.trim().length > 0),
});

// --- P6: Query string resilience ---

export const arbQueryString: fc.Arbitrary<string> = fc
  .array(
    fc.tuple(
      fc.stringMatching(/^[a-z]{1,6}$/).filter((k) => k !== "id"),
      fc.stringMatching(/^[a-zA-Z0-9=]{1,8}$/),
    ),
    { minLength: 1, maxLength: 3 },
  )
  .map((pairs) => pairs.map(([k, v]) => `${k}=${v}`).join("&"));

// --- extractPath arbitrary paths ---

const arbPathSegment: fc.Arbitrary<string> = fc.stringMatching(
  /^[a-z0-9][a-z0-9_-]{0,9}$/,
);

export const arbUrlPath: fc.Arbitrary<string> = fc.oneof(
  fc.constant("/"),
  fc
    .array(arbPathSegment, { minLength: 1, maxLength: 3 })
    .map((segments) => `/${segments.join("/")}`),
);

/**
 * Deeper URL paths (up to 8 segments) for stress-testing extractPath /
 * buildUrl / urlToPath on pathological depths. Complements `arbUrlPath`
 * which caps at 3 segments and misses linear-time-per-segment regressions.
 */
export const arbDeepPath: fc.Arbitrary<string> = fc
  .array(arbPathSegment, { minLength: 4, maxLength: 8 })
  .map((segments) => `/${segments.join("/")}`);

/**
 * URL path segments that include special characters the matcher must
 * tolerate without crashing: uppercase, dots, %-encoded bytes, tildes.
 * Complements `arbPathSegment` (lowercase alphanumeric only) and
 * `arbUnsafeIdParam` (param values, not segment names).
 *
 * The generated segments will typically NOT match the fixture's routes —
 * the purpose is to verify the URL utilities (extractPath, buildUrl,
 * urlToPath, safeParseUrl) never throw on shapes users can type into
 * the address bar.
 */
export const arbSpecialCharSegment: fc.Arbitrary<string> = fc.oneof(
  fc.stringMatching(/^[A-Z]{1,8}$/),
  fc.stringMatching(/^[a-z]{1,4}\.[a-z]{1,4}$/),
  fc.stringMatching(/^~[a-z]{1,6}$/),
  fc.stringMatching(/^[a-z]{1,4}%[0-9A-F]{2}[a-z]{0,4}$/),
);

export const arbSpecialCharPath: fc.Arbitrary<string> = fc
  .array(arbSpecialCharSegment, { minLength: 1, maxLength: 4 })
  .map((segments) => `/${segments.join("/")}`);

// --- non-matching paths (guaranteed to miss all fixture routes) ---

const KNOWN_PREFIXES = new Set(["home", "users", "index"]);

export const arbNonMatchingPath: fc.Arbitrary<string> = fc
  .stringMatching(/^[a-z]{2,8}$/)
  .filter((seg) => !KNOWN_PREFIXES.has(seg))
  .map((seg) => `/unknown/${seg}`);

/**
 * Arbitrary: pick any route name (leaf or parameterized).
 * Used in history model tests for random navigation sequences.
 */
export const arbAnyRoute: fc.Arbitrary<{
  name: string;
  params?: { id: string };
}> = fc.oneof(
  arbLeafRoute.map((name) => ({ name })),
  arbIdParam.map((params) => ({ name: PARAM_ROUTE_NAME, params })),
);

// =============================================================================
// Router Factory
// =============================================================================

/**
 * Create a router with the navigation plugin registered.
 * Uses MockNavigation since jsdom doesn't have the Navigation API.
 *
 * The router does NOT need to be started — `buildUrl` and `matchUrl` are
 * registered via `api.extendRouter()` in the NavigationPlugin constructor,
 * which runs synchronously when `router.usePlugin(factory)` is called.
 */
export function createPluginRouter(base = ""): Router {
  const mockNav = new MockNavigation("http://localhost/");
  const browser = createMockNavigationBrowser(mockNav);
  const router = createRouter(ROUTES);

  router.usePlugin(navigationPluginFactory({ base }, browser));

  return router;
}

/**
 * Create a router + mockNav for stateful property tests.
 * Returns both so tests can simulate back/forward/traverse.
 *
 * Used in history model tests where we need to:
 * - Navigate to multiple routes
 * - Inspect history entries
 * - Simulate back/forward/traverse operations
 */
export function createPluginRouterWithMock(base = ""): {
  router: Router;
  mockNav: MockNavigation;
  browser: NavigationBrowser;
} {
  const mockNav = new MockNavigation("http://localhost/");
  const browser = createMockNavigationBrowser(mockNav);
  const router = createRouter(ROUTES, { defaultRoute: "home" });

  router.usePlugin(navigationPluginFactory({ base }, browser));

  return { router, mockNav, browser };
}
