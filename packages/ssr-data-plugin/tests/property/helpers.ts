// packages/ssr-data-plugin/tests/property/helpers.ts

import { fc } from "@fast-check/vitest";
import { createRouter } from "@real-router/core";

import { ssrDataPluginFactory } from "../../src";

import type { DataLoaderFactoryMap } from "../../src";
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

/**
 * Param values for the users.profile route.
 *
 * Extended from `[a-z0-9]{1,8}` to `[\w.-]{1,16}` (Word + dot + dash),
 * the URL-safe punctuation that real-world route params routinely
 * contain. Length stays bounded so generated paths remain readable in
 * fast-check shrunk failure reports.
 *
 * NOT extended: percent-encoding (`%20`), URL-special chars (`?`, `#`,
 * `:`, `/`), Unicode. Those would change route-matching semantics —
 * the path-matcher's responsibility — and exercising them here would
 * test core's URL parsing, not this plugin.
 */
export const arbParamValue = fc.stringMatching(/^[\w.-]{1,16}$/);

/** Arbitrary JSON-serializable data returned by loaders */
export const arbLoaderData = fc.oneof(
  fc.string(),
  fc.integer(),
  fc.boolean(),
  fc.constant(null),
  fc.constant(undefined),
  fc.dictionary(fc.string({ minLength: 1, maxLength: 5 }), fc.string()),
  fc.array(fc.integer(), { minLength: 0, maxLength: 5 }),
  fc.record({
    nested: fc.dictionary(
      fc.string({ minLength: 1, maxLength: 3 }),
      fc.integer(),
    ),
    list: fc.array(fc.string(), { minLength: 0, maxLength: 3 }),
  }),
);

// =============================================================================
// Router Factory Helpers
// =============================================================================

/**
 * Creates a router with the ssr-data plugin installed.
 * Returns the router and the unsubscribe function.
 */
export function createSsrDataRouter(loaders: DataLoaderFactoryMap): {
  router: Router;
  unsubscribe: () => void;
} {
  const router = createRouter(ROUTES, { defaultRoute: "home" });
  const unsubscribe = router.usePlugin(ssrDataPluginFactory(loaders));

  return { router, unsubscribe };
}
