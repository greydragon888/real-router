// packages/lifecycle-plugin/tests/property/helpers.ts

import { fc } from "@fast-check/vitest";
import { createRouter } from "@real-router/core";

import { lifecyclePluginFactory } from "../../src";

import type { LifecycleHook } from "../../src";
import type { Route, Router } from "@real-router/core";

// =============================================================================
// Route Fixture
// =============================================================================

export const ROUTES: Route[] = [
  { name: "home", path: "/" },
  { name: "about", path: "/about" },
  { name: "contact", path: "/contact" },
  {
    name: "users",
    path: "/users",
    children: [{ name: "view", path: "/:id" }],
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

/** Routes without params (for simple navigation) */
export const arbSimpleRouteName = fc.constantFrom("home", "about", "contact");

/** Pair of distinct simple route names (guarantees route change) */
export const arbDistinctRouteNamePair: fc.Arbitrary<[string, string]> = fc
  .tuple(arbSimpleRouteName, arbSimpleRouteName)
  .filter(([a, b]) => a !== b);

/** Pair of distinct param values for same-route navigation */
export const arbDistinctIdPair: fc.Arbitrary<[string, string]> = fc
  .tuple(
    fc.stringMatching(/^[a-z0-9]{1,5}$/),
    fc.stringMatching(/^[a-z0-9]{1,5}$/),
  )
  .filter(([a, b]) => a !== b);

// =============================================================================
// Router Factory Helpers
// =============================================================================

export interface HookSpies {
  onEnter: LifecycleHook & {
    calls: { toName: string; fromName: string | undefined }[];
  };
  onLeave: LifecycleHook & {
    calls: { toName: string; fromName: string | undefined }[];
  };
  onStay: LifecycleHook & {
    calls: { toName: string; fromName: string | undefined }[];
  };
}

function createHookSpy(): LifecycleHook & {
  calls: { toName: string; fromName: string | undefined }[];
} {
  const calls: { toName: string; fromName: string | undefined }[] = [];
  const fn = ((toState, fromState) => {
    calls.push({ toName: toState.name, fromName: fromState?.name });
  }) as LifecycleHook & {
    calls: { toName: string; fromName: string | undefined }[];
  };

  fn.calls = calls;

  return fn;
}

export function createHookSpies(): HookSpies {
  return {
    onEnter: createHookSpy(),
    onLeave: createHookSpy(),
    onStay: createHookSpy(),
  };
}

/**
 * Creates a router with lifecycle hooks attached to all routes.
 * Returns the router and hook spy records keyed by hook name.
 */
export function createLifecycleRouter(hooks: HookSpies): Router {
  const routes: Route[] = [
    {
      name: "home",
      path: "/",
      onEnter: hooks.onEnter,
      onLeave: hooks.onLeave,
      onStay: hooks.onStay,
    },
    {
      name: "about",
      path: "/about",
      onEnter: hooks.onEnter,
      onLeave: hooks.onLeave,
      onStay: hooks.onStay,
    },
    {
      name: "contact",
      path: "/contact",
      onEnter: hooks.onEnter,
      onLeave: hooks.onLeave,
      onStay: hooks.onStay,
    },
    {
      name: "users",
      path: "/users",
      children: [
        {
          name: "view",
          path: "/:id",
          onEnter: hooks.onEnter,
          onLeave: hooks.onLeave,
          onStay: hooks.onStay,
        },
      ],
    },
  ];

  const router = createRouter(routes, { defaultRoute: "home" });

  router.usePlugin(lifecyclePluginFactory());

  return router;
}

/**
 * Creates a router with lifecycle hooks that record call order.
 * Returns the router and the shared call order array.
 */
export function createOrderTrackingRouter(): {
  router: Router;
  callOrder: string[];
} {
  const callOrder: string[] = [];

  const routes: Route[] = [
    {
      name: "home",
      path: "/",
      onEnter: () => {
        callOrder.push("onEnter:home");
      },
      onLeave: () => {
        callOrder.push("onLeave:home");
      },
    },
    {
      name: "about",
      path: "/about",
      onEnter: () => {
        callOrder.push("onEnter:about");
      },
      onLeave: () => {
        callOrder.push("onLeave:about");
      },
    },
    {
      name: "contact",
      path: "/contact",
      onEnter: () => {
        callOrder.push("onEnter:contact");
      },
      onLeave: () => {
        callOrder.push("onLeave:contact");
      },
    },
  ];

  const router = createRouter(routes, { defaultRoute: "home" });

  router.usePlugin(lifecyclePluginFactory());

  return { router, callOrder };
}
