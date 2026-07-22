import { fc } from "@fast-check/vitest";
import { createRouter } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";

import type { RouterTransitionSnapshot } from "../../src/types.js";
import type { Route, Router, Params } from "@real-router/core";

// =============================================================================
// Fixed Route Fixture
// =============================================================================

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
];

// =============================================================================
// Route Name Constants
// =============================================================================

export const NAVIGABLE_ROUTE_NAMES = [
  "home",
  "users.list",
  "users.view",
  "users.edit",
  "admin.dashboard",
  "admin.settings",
  "search",
] as const;

export const NODE_NAMES = [
  "",
  "home",
  "users",
  "admin",
  "search",
  "users.list",
  "admin.dashboard",
] as const;

// =============================================================================
// Generators (Arbitraries)
// =============================================================================

export const arbRouteName = fc.constantFrom(
  ...(NAVIGABLE_ROUTE_NAMES as unknown as [string, ...string[]]),
);

export const arbNodeName = fc.constantFrom(
  ...(NODE_NAMES as unknown as [string, ...string[]]),
);

// Stateless params builder: the optional `seed` parameter lets callers thread
// a unique value through `users.view` / `users.edit` ids, avoiding SAME_STATES
// on consecutive identical-route navigations without relying on a hidden
// module-level counter. Single-shot tests can omit the seed (default 1).
export function paramsForRoute(name: string, seed = 1): Params {
  switch (name) {
    case "users.view":
    case "users.edit": {
      const safeSeed = Math.abs(seed) || 1;

      return { id: `u${String(safeSeed)}` };
    }
    case "search": {
      return { q: "test", page: "1" };
    }
    default: {
      return {};
    }
  }
}

export interface NavigationAction {
  name: string;
  params: Params;
}

export const arbNavigation: fc.Arbitrary<NavigationAction> = arbRouteName.map(
  (name) => ({
    name,
    params: paramsForRoute(name),
  }),
);

// Sequence arbitrary: derive the params seed from `(fc.integer × 32) + index`.
// The 32× factor exceeds `maxLength` (20), so two distinct positions in the
// array cannot collide — guarantees unique ids for adjacent users.view /
// users.edit navigations across any combination of seeds and indices, while
// still letting fast-check shrink through the seed space.
export const arbNavigationSeq: fc.Arbitrary<NavigationAction[]> = fc
  .array(fc.tuple(arbRouteName, fc.integer({ min: 0, max: 1_000_000 })), {
    minLength: 1,
    maxLength: 20,
  })
  .map((pairs) =>
    pairs.map(([name, seed], index): NavigationAction => ({
      name,
      params: paramsForRoute(name, seed * 32 + index + 1),
    })),
  );

export const arbListenerCount = fc.integer({ min: 1, max: 10 });

// Covers the full options surface, including the hash-aware branch (#532).
// `hash` is intentionally absent most of the time (skewed 4:1) so the
// majority of runs continue to exercise pure route-name semantics. The
// key is built conditionally because `ActiveRouteSourceOptions.hash` uses
// `exactOptionalPropertyTypes: true` — `{ hash: undefined }` would not
// type-check.
const arbActiveOptionsBase = fc.record(
  {
    strict: fc.boolean(),
    ignoreQueryParams: fc.boolean(),
  },
  { requiredKeys: [] },
);
const arbHashOption = fc.option(
  fc.string({ minLength: 0, maxLength: 16 }).filter((s) => !s.includes("#")),
  { nil: undefined, freq: 4 },
);

export const arbActiveOptions: fc.Arbitrary<{
  strict?: boolean;
  ignoreQueryParams?: boolean;
  hash?: string;
}> = fc
  .tuple(arbActiveOptionsBase, arbHashOption)
  .map(([base, hash]) => (hash === undefined ? base : { ...base, hash }));

export const arbDestroyCount = fc.integer({ min: 1, max: 5 });

// =============================================================================
// Router Factory Helpers
// =============================================================================

export function createFixtureRouter(): Router {
  return createRouter(ROUTES);
}

export async function createStartedRouter(): Promise<Router> {
  const router = createFixtureRouter();

  await router.start("/");

  return router;
}

export async function createRouterWithAsyncGuard(
  guardedRoute: string,
): Promise<{
  router: Router;
  resolveGuard: (value: boolean) => void;
}> {
  const router = createFixtureRouter();

  await router.start("/");

  let resolveGuard!: (value: boolean) => void;

  const lifecycle = getLifecycleApi(router);

  lifecycle.addActivateGuard(guardedRoute, () => () => {
    return new Promise<boolean>((resolve) => {
      resolveGuard = resolve;
    });
  });

  return { router, resolveGuard };
}

export async function executeNavigations(
  router: Router,
  navigations: NavigationAction[],
): Promise<void> {
  for (const nav of navigations) {
    await router.navigate(nav.name, nav.params);
  }
}

// =============================================================================
// Oracles
// =============================================================================

/**
 * Mirrors `createActiveRouteSource`'s `computeActive` for use as a test oracle.
 * Without a URL-publishing plugin (browser/navigation), `state.context.url` is
 * undefined → `readContextHash` returns `""`. The fixture router used by
 * property tests has no such plugin, so any non-empty `hash` option resolves
 * to "always false" — matching the documented behaviour.
 */
export function expectedActive(
  router: Router,
  routeName: string,
  params: Params | undefined,
  strict: boolean,
  ignoreQueryParams: boolean,
  hash: string | undefined,
): boolean {
  if (
    !router.isActiveRoute(
      routeName,
      params,
      undefined,
      strict,
      ignoreQueryParams,
    )
  ) {
    return false;
  }
  if (hash === undefined) {
    return true;
  }

  const ctx = router.getState()?.context as
    { url?: { hash?: string } } | undefined;
  const contextHash = ctx?.url?.hash ?? "";

  return contextHash === hash;
}

// =============================================================================
// Shared snapshot constants
// =============================================================================

export const IDLE_TRANSITION: RouterTransitionSnapshot = {
  isTransitioning: false,
  isLeaveApproved: false,
  toRoute: null,
  fromRoute: null,
};

// =============================================================================
// Navigation-sequence predicates
// =============================================================================

/**
 * Filters out sequences that would trigger SAME_STATES inside the router:
 *
 * - first action must not be "home" (router boots at "/", which routes to home)
 * - no two adjacent actions may target the same route, EXCEPT
 *   `users.view` / `users.edit`, whose params come from a counter and produce
 *   distinct states for back-to-back hits.
 */
export function avoidsSameStateNavigations(
  navigations: NavigationAction[],
): boolean {
  return (
    navigations[0]?.name !== "home" &&
    navigations.every(
      (nav, i) =>
        i === 0 ||
        nav.name !== navigations[i - 1].name ||
        nav.name === "users.view" ||
        nav.name === "users.edit",
    )
  );
}

// =============================================================================
// numRuns constants
// =============================================================================

export const NUM_RUNS = {
  standard: 100,
  // Used for lifecycle (subscribe/unsubscribe) properties that need a few
  // shrinking cycles — kept lower than `standard` because shrinking is
  // dominated by setup/teardown of fresh routers.
  lifecycle: 50,
  // Async navigation tests serialise heavily on microtasks; bumping to 50
  // gives more coverage of guard-resolve / cancel races without ballooning
  // the suite duration.
  async: 50,
} as const;
