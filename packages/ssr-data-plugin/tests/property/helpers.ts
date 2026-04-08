// packages/ssr-data-plugin/tests/property/helpers.ts

import { fc } from "@fast-check/vitest";
import { createRouter } from "@real-router/core";

import { ssrDataPluginFactory } from "../../src";

import type { DataLoaderMap } from "../../src";
import type { Route, Router } from "@real-router/core";

// =============================================================================
// Route Fixture
// =============================================================================

export const ROUTES: Route[] = [
  { name: "home", path: "/" },
  { name: "about", path: "/about" },
  {
    name: "users",
    path: "/users",
    children: [
      { name: "list", path: "/" },
      { name: "profile", path: "/:id" },
    ],
  },
];

// =============================================================================
// numRuns Constants
// =============================================================================

export const NUM_RUNS = {
  standard: 50,
  thorough: 100,
} as const;

// =============================================================================
// Arbitraries
// =============================================================================

/** Route names that have no params */
export const arbSimpleRouteName = fc.constantFrom(
  "home",
  "about",
  "users.list",
);

/** Param values for the users.profile route */
export const arbParamValue = fc.stringMatching(/^[a-z0-9]{1,8}$/);

/** Arbitrary JSON-serializable data returned by loaders */
export const arbLoaderData = fc.oneof(
  fc.string(),
  fc.integer(),
  fc.boolean(),
  fc.constant(null),
  fc.dictionary(fc.string({ minLength: 1, maxLength: 5 }), fc.string()),
  fc.array(fc.integer(), { minLength: 0, maxLength: 5 }),
);

// =============================================================================
// Router Factory Helpers
// =============================================================================

/**
 * Creates a router with the ssr-data plugin installed.
 * Returns the router and the unsubscribe function.
 */
export function createSsrDataRouter(loaders: DataLoaderMap): {
  router: Router;
  unsubscribe: () => void;
} {
  const router = createRouter(ROUTES, { defaultRoute: "home" });
  const unsubscribe = router.usePlugin(ssrDataPluginFactory(loaders));

  return { router, unsubscribe };
}
