// packages/route-tree/tests/property/helpers.ts

/**
 * Shared helpers for route-tree property-based tests.
 *
 * Provides:
 * - Pre-built matcher factories for different test scenarios
 * - Route tree builders for testing tree invariants
 * - fast-check arbitraries for param values, query values, etc.
 *
 * Strategy: fixed route tree shapes, randomized input values —
 * same approach as path-matcher property tests.
 */

import { fc } from "@fast-check/vitest";

import { createRouteTree } from "../../src/builder/createRouteTree";
import { createMatcher } from "../../src/createMatcher";

import type { QueryParamsConfig } from "../../src/createMatcher";
import type { RouteTree } from "../../src/types";

// =============================================================================
// Constants
// =============================================================================

export const NUM_RUNS = {
  fast: 100,
  standard: 500,
  thorough: 1000,
} as const;

// =============================================================================
// Pre-built Route Trees (fixed shapes for property tests)
// =============================================================================

/**
 * Tree with URL param route.
 *
 * Structure: root > users(/users) > profile(/:id)
 * Routes: "users", "users.profile"
 */
export const PARAM_TREE: RouteTree = createRouteTree("", "", [
  {
    name: "users",
    path: "/users",
    children: [{ name: "profile", path: "/:id" }],
  },
]);

/**
 * Tree with query-param-only route.
 *
 * Structure: root > search(/search?q&page)
 * Routes: "search"
 * Params: q (query), page (query)
 */
export const QUERY_TREE: RouteTree = createRouteTree("", "", [
  { name: "search", path: "/search?q&page" },
]);

/**
 * Tree with both URL params and query params on the same route.
 *
 * Structure: root > results(/results/:category?q)
 * Routes: "results"
 * Params: category (url), q (query)
 */
export const MIXED_TREE: RouteTree = createRouteTree("", "", [
  { name: "results", path: "/results/:category?q" },
]);

/**
 * Tree for array query param testing.
 *
 * Structure: root > items(/items?tags)
 * Routes: "items"
 * Params: tags (query, expected to be an array)
 */
export const ARRAY_QUERY_TREE: RouteTree = createRouteTree("", "", [
  { name: "items", path: "/items?tags" },
]);

/**
 * Deep tree for testing getSegmentsByName (nameToIDs equivalent).
 *
 * Structure:
 *   root
 *   ├── home (/)
 *   ├── users (/users)
 *   │   └── profile (/:id)
 *   │       └── edit (/edit)
 *   │           └── photo (/photo)
 *   └── admin (/admin)
 *       └── settings (/settings)
 *           └── theme (/theme)
 */
export const DEEP_TREE: RouteTree = createRouteTree("", "", [
  { name: "home", path: "/" },
  {
    name: "users",
    path: "/users",
    children: [
      {
        name: "profile",
        path: "/:id",
        children: [
          {
            name: "edit",
            path: "/edit",
            children: [{ name: "photo", path: "/photo" }],
          },
        ],
      },
    ],
  },
  {
    name: "admin",
    path: "/admin",
    children: [
      {
        name: "settings",
        path: "/settings",
        children: [{ name: "theme", path: "/theme" }],
      },
    ],
  },
]);

/**
 * Tree with absolute path child (for normalization test).
 *
 * Structure: root > parent(/parent) > dashboard(~dashboard) [absolute]
 * The absolute path "~dashboard" → node.path = "dashboard", node.absolute = true
 */
export const ABSOLUTE_PATH_TREE: RouteTree = createRouteTree("", "", [
  {
    name: "parent",
    path: "/parent",
    children: [{ name: "dashboard", path: "~/dashboard" }],
  },
]);

/**
 * Tree with both absolute and non-absolute children under the same parent.
 * Used for testing nonAbsoluteChildren filtering and absolute path roundtrips.
 *
 * Structure:
 *   root
 *   └── app (/app)
 *       ├── dashboard (~/dashboard) [absolute]
 *       ├── settings (/settings)
 *       └── profile (~/profile) [absolute]
 */
export const MIXED_ABSOLUTE_TREE: RouteTree = createRouteTree("", "", [
  {
    name: "app",
    path: "/app",
    children: [
      { name: "dashboard", path: "~/dashboard" },
      { name: "settings", path: "/settings" },
      { name: "profile", path: "~/profile" },
    ],
  },
]);

// =============================================================================
// Matcher Factories (pre-configured with trees)
// =============================================================================

/**
 * Matcher with URL param route.
 *
 * Tree: root > users(/users) > profile(/:id)
 * Routes: "users", "users.profile"
 */
export function createParamMatcher(): ReturnType<typeof createMatcher> {
  const matcher = createMatcher();

  matcher.registerTree(PARAM_TREE);

  return matcher;
}

/**
 * Matcher with query-param-only route.
 *
 * Tree: root > search(/search?q&page)
 * Routes: "search"
 */
export function createQueryMatcher(
  qpConfig?: QueryParamsConfig,
): ReturnType<typeof createMatcher> {
  const matcher = createMatcher(qpConfig ? { queryParams: qpConfig } : {});

  matcher.registerTree(QUERY_TREE);

  return matcher;
}

/**
 * Matcher with both URL params and query params.
 *
 * Tree: root > results(/results/:category?q)
 * Routes: "results"
 */
export function createMixedMatcher(): ReturnType<typeof createMatcher> {
  const matcher = createMatcher();

  matcher.registerTree(MIXED_TREE);

  return matcher;
}

/**
 * Matcher with splat param route.
 *
 * Tree: root > files(/files) > catchAll(/*path)
 * Routes: "files", "files.catchAll"
 */
export function createSplatMatcher(): ReturnType<typeof createMatcher> {
  const matcher = createMatcher();

  matcher.registerTree(SPLAT_TREE);

  return matcher;
}

/**
 * Matcher for array query param testing.
 *
 * Tree: root > items(/items?tags)
 * Routes: "items"
 *
 * @param arrayFormat - Array serialization format
 */
export function createArrayMatcher(
  arrayFormat: "none" | "brackets" | "index" | "comma",
): ReturnType<typeof createMatcher> {
  const matcher = createMatcher({
    queryParams: { arrayFormat, numberFormat: "none" },
  });
  const tree = createRouteTree("", "", [
    { name: "items", path: "/items?tags" },
  ]);

  matcher.registerTree(tree);

  return matcher;
}

/**
 * Tree with splat param route.
 *
 * Structure: root > files(/files) > catchAll(/*path)
 * Routes: "files", "files.catchAll"
 * Params: path (splat)
 */
export const SPLAT_TREE: RouteTree = createRouteTree("", "", [
  {
    name: "files",
    path: "/files",
    children: [{ name: "catchAll", path: "/*path" }],
  },
]);

// =============================================================================
// Valid route names in DEEP_TREE (for getSegmentsByName tests)
// =============================================================================

/**
 * All valid route names in DEEP_TREE — used as constants for segment tests.
 */
export const DEEP_TREE_ROUTE_NAMES = [
  "home",
  "users",
  "users.profile",
  "users.profile.edit",
  "users.profile.edit.photo",
  "admin",
  "admin.settings",
  "admin.settings.theme",
] as const;

export { getSegmentsByName } from "../../src/operations/query";

// =============================================================================
// Arbitraries (Generators)
// =============================================================================

/**
 * URL-safe param value: alphanumeric + hyphen/underscore/tilde/dot.
 * Safe for ALL encoding types in URL paths.
 */
export const arbSafeParamValue: fc.Arbitrary<string> = fc.stringMatching(
  /^[a-zA-Z0-9_\-.~]{1,15}$/,
);

/**
 * Safe query param value: alphanumeric + hyphen/dot/underscore.
 * No special query string chars (no &, =, ?, #, +, %)
 */
export const arbSafeQueryValue: fc.Arbitrary<string> = fc.stringMatching(
  /^[a-zA-Z0-9_.-]{1,15}$/,
);

/**
 * Safe query param name: valid identifier.
 */
export const arbQueryParamName: fc.Arbitrary<string> =
  fc.stringMatching(/^[a-zA-Z_]\w{0,10}$/);

/**
 * Array of 1–4 unique safe query param names.
 * Used for Q1 (extraction) and Q2 (separation) invariants.
 */
export const arbQueryParamNames: fc.Arbitrary<string[]> = fc
  .array(arbQueryParamName, { minLength: 1, maxLength: 4 })
  .filter(
    (names) => new Set(names).size === names.length, // enforce uniqueness
  );

/**
 * Splat param value: 1–4 path segments joined by "/".
 * Each segment is a safe alphanumeric string (no slashes or special chars).
 * Produces values like "docs/readme.md" or "a/b/c".
 */
export const arbSplatValue: fc.Arbitrary<string> = fc
  .array(fc.stringMatching(/^[a-zA-Z0-9_\-.~]{1,10}$/), {
    minLength: 1,
    maxLength: 4,
  })
  .map((segments) => segments.join("/"));

/**
 * Array of 1–4 safe string items for array query param tests.
 */
export const arbArrayItems: fc.Arbitrary<string[]> = fc.array(
  fc.stringMatching(/^[a-zA-Z0-9_.-]{1,10}$/),
  { minLength: 1, maxLength: 4 },
);

/**
 * All 4 array format values.
 */
export const arbArrayFormat: fc.Arbitrary<
  "none" | "brackets" | "index" | "comma"
> = fc.constantFrom("none", "brackets", "index", "comma");

/**
 * Valid route name from DEEP_TREE (for getSegmentsByName tests).
 */
export const arbDeepTreeRouteName: fc.Arbitrary<string> = fc.constantFrom(
  ...(DEEP_TREE_ROUTE_NAMES as unknown as [string, ...string[]]),
);

/**
 * Valid route name with 1–4 segments (fast-path range in getSegmentsByName).
 */
export const arbShallowDeepTreeRouteName: fc.Arbitrary<string> =
  fc.constantFrom(
    "home",
    "users",
    "users.profile",
    "users.profile.edit",
    "admin",
    "admin.settings",
    "admin.settings.theme",
  );

/**
 * Route names guaranteed NOT to exist in DEEP_TREE.
 * Used for S5 (null return on unknown name).
 */
export const arbUnknownRouteName: fc.Arbitrary<string> = fc.constantFrom(
  "nonexistent",
  "foo",
  "bar.baz",
  "users.unknown",
  "admin.missing",
  "x.y.z.w.v",
);
