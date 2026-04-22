// packages/browser-plugin/tests/property/helpers.ts

/**
 * Shared helpers for browser-plugin property-based tests.
 *
 * Provides:
 * - Route fixture (same shape as functional test helpers)
 * - fast-check arbitraries for route names, id params, base paths
 * - createPluginRouter factory — creates router + registers browserPluginFactory
 * - NUM_RUNS constants for controlling test iterations
 */

import { fc } from "@fast-check/vitest";
import { createRouter } from "@real-router/core";

import { browserPluginFactory } from "@real-router/browser-plugin";

import type { Route, Router } from "@real-router/core";

// =============================================================================
// Constants
// =============================================================================

export const NUM_RUNS = {
  fast: 100,
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
 * about the Browser URL API path extraction (safeParseUrl manual parser).
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
 *
 * Combines a curated fixed list of real-world shapes (`/app.v2`, `/my-app`,
 * `/v2/api`) with a generator for deep-nested bases (2–5 segments) to
 * exercise path handling beyond one or two levels.
 */
const arbDeepBase: fc.Arbitrary<string> = fc
  .array(fc.stringMatching(/^[a-z][a-z0-9._-]{0,5}$/), {
    minLength: 2,
    maxLength: 5,
  })
  .map((segments) => `/${segments.join("/")}`);

export const arbNormalizedBase: fc.Arbitrary<string> = fc.oneof(
  fc.constant(""),
  fc.constantFrom(
    "/app",
    "/sub",
    "/nested/base",
    "/app.v2",
    "/my-app",
    "/v2",
    "/api/v3",
    "/a1/b2/c3",
    "/under_score",
    "/mixed-name.v1",
  ),
  arbDeepBase,
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

// --- P2c: URL-unsafe character params ---

export const arbUnsafeIdParam: fc.Arbitrary<{ id: string }> = fc.record({
  id: fc
    .string({ minLength: 1, maxLength: 20 })
    .filter((s) => s.trim().length > 0),
});

// --- P6: Query string resilience ---
//
// Three value shapes mirror real-world query strings:
//   - alphanumeric (baseline)
//   - percent-encoded (encodeURIComponent-safe values with space/`&`/`=`)
//   - empty values (`?key=`) that real routers must tolerate
// Keys are filtered to never be `id` (reserved for the `users.view` route).

const arbQueryKey: fc.Arbitrary<string> = fc
  .stringMatching(/^[a-z]{1,6}$/)
  .filter((k) => k !== "id");

const arbAlphaValue: fc.Arbitrary<string> =
  fc.stringMatching(/^[a-zA-Z0-9=]{1,8}$/);

const arbEncodedValue: fc.Arbitrary<string> = fc
  .string({ minLength: 0, maxLength: 8 })
  .map((raw) => encodeURIComponent(raw));

const arbEmptyValue: fc.Arbitrary<string> = fc.constant("");

const arbQueryValue: fc.Arbitrary<string> = fc.oneof(
  arbAlphaValue,
  arbEncodedValue,
  arbEmptyValue,
);

export const arbQueryString: fc.Arbitrary<string> = fc
  .array(fc.tuple(arbQueryKey, arbQueryValue), { minLength: 1, maxLength: 3 })
  .map((pairs) => pairs.map(([k, v]) => `${k}=${v}`).join("&"));

// --- extractPath arbitrary paths ---

const arbPathSegment: fc.Arbitrary<string> = fc.stringMatching(
  /^[a-z0-9][a-z0-9_-]{0,9}$/,
);

export const arbUrlPath: fc.Arbitrary<string> = fc
  .array(arbPathSegment, { minLength: 1, maxLength: 3 })
  .map((segments) => `/${segments.join("/")}`);

// --- non-matching paths (guaranteed to miss all fixture routes) ---

const KNOWN_PREFIXES = new Set(["home", "users", "index"]);

export const arbNonMatchingPath: fc.Arbitrary<string> = fc
  .stringMatching(/^[a-z]{2,8}$/)
  .filter((seg) => !KNOWN_PREFIXES.has(seg))
  .map((seg) => `/unknown/${seg}`);

// =============================================================================
// Router Factory
// =============================================================================

/**
 * Create a router with the browser plugin registered.
 *
 * The router does NOT need to be started — `buildUrl` and `matchUrl` are
 * registered via `api.extendRouter()` in the BrowserPlugin constructor,
 * which runs synchronously when `router.usePlugin(factory)` is called.
 *
 * In jsdom, `isBrowserEnvironment()` returns true (window + history exist),
 * so `createSafeBrowser` uses real History API wrappers. No SSR fallback.
 */
export function createPluginRouter(base = ""): Router {
  const router = createRouter(ROUTES);

  router.usePlugin(browserPluginFactory({ base }));

  return router;
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Normalize params to strings for comparison after URL roundtrip.
 * URL params are always decoded as strings by the path matcher.
 */
export function normalizeParams(
  params: Record<string, unknown>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(params).map(([k, v]) => [k, String(v)]),
  );
}
