import { fc } from "@fast-check/vitest";
import { createRouter } from "@real-router/core";

import { persistentParamsPluginFactory } from "@real-router/persistent-params-plugin";

import type { Route, Router } from "@real-router/core";

// =============================================================================
// Fixed Route Fixture
// =============================================================================

export const ROUTES: Route[] = [
  { name: "home", path: "/" },
  { name: "routeA", path: "/a/:id" },
  { name: "routeB", path: "/b/:id" },
  { name: "routeC", path: "/c/:id" },
];

// =============================================================================
// Unique ID Generator
// IIFE-wrapped to avoid module-level let (per project conventions)
// =============================================================================

/**
 * Returns a globally unique string ID across all test runs.
 * Prevents SAME_STATES errors when navigating to the same route with the same
 * effective params after plugin injection.
 */
export const nextId: () => string = (() => {
  let counter = 0;

  return () => String(++counter);
})();

// =============================================================================
// Param Name / Value Constants
// =============================================================================

export const PARAM_NAMES = [
  "lang",
  "theme",
  "mode",
  "version",
  "flag",
] as const;

export const PARAM_VALUES = [
  "en",
  "fr",
  "dark",
  "light",
  "dev",
  "prod",
  "v1",
  "v2",
] as const;

// =============================================================================
// Generators (Arbitraries)
// =============================================================================

export const arbParamName = fc.constantFrom(
  ...(PARAM_NAMES as unknown as [string, ...string[]]),
);

export const arbParamValue = fc.constantFrom(
  ...(PARAM_VALUES as unknown as [string, ...string[]]),
);

export const arbTwoDifferentParamNames: fc.Arbitrary<[string, string]> = fc
  .tuple(arbParamName, arbParamName)
  .filter(([a, b]) => a !== b);

export const arbTwoDistinctValues: fc.Arbitrary<[string, string]> = fc
  .tuple(arbParamValue, arbParamValue)
  .filter(([a, b]) => a !== b);

// =============================================================================
// Router Factory Helpers
// =============================================================================

/**
 * queryParamsMode: "default" allows query params on all routes without
 * requiring explicit `?param` syntax in the path definition.
 */
export function createRouterWithPlugin(paramNames: string[]): Router {
  const router = createRouter(ROUTES, { queryParamsMode: "default" });

  router.usePlugin(persistentParamsPluginFactory(paramNames));

  return router;
}

export async function createStartedRouter(
  paramNames: string[],
): Promise<Router> {
  const router = createRouterWithPlugin(paramNames);

  await router.start("/");

  return router;
}

export async function createStartedRouterWithDefaults(
  defaults: Record<string, string>,
): Promise<Router> {
  const router = createRouter(ROUTES, { queryParamsMode: "default" });

  router.usePlugin(persistentParamsPluginFactory(defaults));

  await router.start("/");

  return router;
}

// =============================================================================
// numRuns constants
// =============================================================================

export const NUM_RUNS = {
  async: 50,
  standard: 50,
} as const;
