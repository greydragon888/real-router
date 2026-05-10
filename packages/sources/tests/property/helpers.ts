import { fc } from "@fast-check/vitest";
import { createRouter } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";

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

// Pseudo-stateful params builder: a module-level counter ensures consecutive
// calls to `users.view` / `users.edit` produce distinct `id` values, so
// back-to-back navigations don't trip SAME_STATES. The counter makes the
// arbitrary mildly non-deterministic across shrinking attempts (same seed
// can produce different ids), but in practice the failing-input shape is
// preserved — the failure mode the audit warned about is shrink-replay
// noise, not false negatives. Tests that need strict determinism should
// thread `fc.integer()` through their own arbitrary.
export const paramsForRoute = (() => {
  let counter = 0;

  return (name: string): Params => {
    switch (name) {
      case "users.view":
      case "users.edit": {
        return { id: `u${String(++counter)}` };
      }
      case "search": {
        return { q: "test", page: "1" };
      }
      default: {
        return {};
      }
    }
  };
})();

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

export const arbNavigationSeq = fc.array(arbNavigation, {
  minLength: 1,
  maxLength: 20,
});

export const arbListenerCount = fc.integer({ min: 1, max: 10 });

export const arbActiveOptions = fc.record(
  {
    strict: fc.boolean(),
    ignoreQueryParams: fc.boolean(),
  },
  { requiredKeys: [] },
);

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
